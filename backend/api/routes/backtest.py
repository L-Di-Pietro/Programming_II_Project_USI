"""Backtest routes — submit / list / inspect runs."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from backend.agents.analytics_agent import AnalyticsAgent, AnalyticsAgentInput
from backend.agents.backtest_agent import BacktestAgent, BacktestAgentInput
from backend.agents.base import AgentError
from backend.agents.explanation_agent import ExplanationAgent, ExplanationAgentInput
from backend.analytics.report_pdf import build_report_pdf, pdf_filename
from backend.api.schemas import (
    BacktestRequest,
    BacktestSummary,
    ChartResponse,
    EquityPointOut,
    MetricsOut,
    ReportResponse,
    TradeOut,
)
from backend.backtest.risk import SizingMode
from backend.database import get_session
from backend.database.models import (
    Asset,
    BacktestRun,
    BenchmarkEquityPoint,
    BenchmarkKind,
    EquityPoint,
    Trade,
)

router = APIRouter(prefix="/backtests", tags=["backtests"])


def _to_summary(run: BacktestRun) -> BacktestSummary:
    """Enrich a run with its strategy name + asset symbol for the API payload."""
    return BacktestSummary(
        id=run.id,
        strategy_id=run.strategy_id,
        strategy_name=run.strategy.name,
        asset_id=run.asset_id,
        asset_symbol=run.asset.symbol,
        timeframe=run.timeframe,
        start_date=run.start_date,
        end_date=run.end_date,
        status=run.status,
        error_message=run.error_message,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )


# -----------------------------------------------------------------------------
# Submit a new run
# -----------------------------------------------------------------------------
@router.post("", response_model=BacktestSummary, status_code=201)
def submit_backtest(
    request: BacktestRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
) -> BacktestRun:
    """Submit a backtest run.

    For v1 the run executes **inline** (synchronously). For v1.1 we'll move
    to a BackgroundTask that returns immediately with the run id; the UI
    already polls so swapping is non-breaking.
    """
    asset = db.execute(
        select(Asset).where(Asset.symbol == request.asset_symbol)
    ).scalar_one_or_none()
    if asset is None:
        raise HTTPException(404, f"Unknown asset symbol {request.asset_symbol!r}")

    agent = BacktestAgent(db)
    try:
        sizing = SizingMode(request.sizing_mode)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    try:
        agent.run(
            BacktestAgentInput(
                asset_id=asset.id,
                strategy_slug=request.strategy_slug,
                start_date=request.start_date,
                end_date=request.end_date,
                params=request.params,
                initial_cash=request.initial_cash,
                commission_bps=request.commission_bps,
                slippage_bps=request.slippage_bps,
                risk_fraction=request.risk_fraction,
                sizing_mode=sizing,
                max_dd_pct=request.max_dd_pct,
                timeframe=request.timeframe.value,
            )
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e)) from e

    # Return the latest run (just inserted by the agent) for this user/strategy combo.
    run = db.execute(
        select(BacktestRun)
        .options(joinedload(BacktestRun.strategy), joinedload(BacktestRun.asset))
        .order_by(BacktestRun.id.desc())
        .limit(1)
    ).scalar_one()
    return _to_summary(run)


# -----------------------------------------------------------------------------
# List + detail
# -----------------------------------------------------------------------------
@router.get("", response_model=list[BacktestSummary])
def list_backtests(
    limit: int = 50,
    db: Session = Depends(get_session),
) -> list[BacktestSummary]:
    """List runs newest-first."""
    runs = (
        db.execute(
            select(BacktestRun)
            .options(joinedload(BacktestRun.strategy), joinedload(BacktestRun.asset))
            .order_by(BacktestRun.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [_to_summary(r) for r in runs]


@router.get("/{run_id}", response_model=BacktestSummary)
def get_backtest(run_id: int, db: Session = Depends(get_session)) -> BacktestSummary:
    run = db.get(BacktestRun, run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")
    return _to_summary(run)


# -----------------------------------------------------------------------------
# Sub-resources: trades, equity, metrics, charts
# -----------------------------------------------------------------------------
@router.get("/{run_id}/trades", response_model=list[TradeOut])
def get_trades(run_id: int, db: Session = Depends(get_session)) -> list[Trade]:
    return (
        db.execute(select(Trade).where(Trade.run_id == run_id).order_by(Trade.ts))
        .scalars()
        .all()
    )


@router.get("/{run_id}/equity", response_model=list[EquityPointOut])
def get_equity(run_id: int, db: Session = Depends(get_session)) -> list[EquityPoint]:
    return (
        db.execute(
            select(EquityPoint).where(EquityPoint.run_id == run_id).order_by(EquityPoint.ts)
        )
        .scalars()
        .all()
    )


@router.get("/{run_id}/metrics", response_model=MetricsOut)
def get_metrics(run_id: int, db: Session = Depends(get_session)) -> MetricsOut:
    agent = AnalyticsAgent(db)
    payload = agent.run(AnalyticsAgentInput(op="metrics", run_id=run_id)).payload
    # API shape uses ``return`` as a key — Pydantic field aliasing handles it.
    return MetricsOut.model_validate(
        {
            "return": payload.get("return", {}),
            "risk": payload.get("risk", {}),
            "trade": payload.get("trade", {}),
        }
    )


_ChartKind = Literal["equity", "drawdown", "heatmap", "trade_pnl", "rolling_sharpe"]


@router.get("/{run_id}/charts/{kind}", response_model=ChartResponse)
def get_chart(
    run_id: int,
    kind: _ChartKind,
    db: Session = Depends(get_session),
) -> ChartResponse:
    agent = AnalyticsAgent(db)
    figure = agent.run(AnalyticsAgentInput(op="chart", run_id=run_id, chart=kind)).payload
    return ChartResponse(figure=figure)


# -----------------------------------------------------------------------------
# Benchmark overlays — same shapes as /equity and /metrics, scoped to a run.
#
# The curves are computed + persisted at run-time (BenchmarkEquityPoint), so
# these endpoints just serve them; metrics are derived from the stored equity
# via the same compute_metrics path the strategy uses.
# -----------------------------------------------------------------------------
_BenchmarkKindParam = Literal["buy_and_hold", "sp500"]

_BENCHMARK_KIND_MAP: dict[str, BenchmarkKind] = {
    "buy_and_hold": BenchmarkKind.ASSET_BUYHOLD,
    "sp500": BenchmarkKind.SPY_BUYHOLD,
}


@router.get("/{run_id}/benchmark/{kind}/equity", response_model=list[EquityPointOut])
def get_benchmark_equity(
    run_id: int,
    kind: _BenchmarkKindParam,
    db: Session = Depends(get_session),
) -> list[EquityPointOut]:
    """Benchmark equity curve, in the same shape as ``/equity``.

    Serves the curve persisted at run-time. ``cash`` / ``position_value`` aren't
    stored (the overlay only consumes ts + equity), so they're synthesized: a
    buy-and-hold is fully invested, hence ``position_value == equity`` and
    ``cash == 0``. ``drawdown_pct`` is derived from the equity series.
    """
    if db.get(BacktestRun, run_id) is None:
        raise HTTPException(404, f"Run {run_id} not found")
    mapped = _BENCHMARK_KIND_MAP[kind]
    rows = (
        db.execute(
            select(BenchmarkEquityPoint)
            .where(
                BenchmarkEquityPoint.run_id == run_id,
                BenchmarkEquityPoint.kind == str(mapped),
            )
            .order_by(BenchmarkEquityPoint.ts)
        )
        .scalars()
        .all()
    )
    if not rows:
        raise HTTPException(404, f"Benchmark {kind!r} not available for run {run_id}")

    out: list[EquityPointOut] = []
    peak = float("-inf")
    for r in rows:
        peak = max(peak, r.equity)
        drawdown = (r.equity / peak - 1.0) if peak > 0 else 0.0
        out.append(
            EquityPointOut(
                ts=r.ts,
                equity=r.equity,
                cash=0.0,
                position_value=r.equity,
                drawdown_pct=drawdown,
            )
        )
    return out


@router.get("/{run_id}/benchmark/{kind}/metrics", response_model=MetricsOut)
def get_benchmark_metrics(
    run_id: int,
    kind: _BenchmarkKindParam,
    db: Session = Depends(get_session),
) -> MetricsOut:
    """Benchmark KPIs, in the same shape as ``/metrics`` (trade block zeroed)."""
    if db.get(BacktestRun, run_id) is None:
        raise HTTPException(404, f"Run {run_id} not found")
    mapped = _BENCHMARK_KIND_MAP[kind]
    agent = AnalyticsAgent(db)
    payload = agent.run(
        AnalyticsAgentInput(
            op="benchmark_metrics", run_id=run_id, benchmark_kind=str(mapped)
        )
    ).payload
    if payload is None:
        raise HTTPException(404, f"Benchmark {kind!r} not available for run {run_id}")
    return MetricsOut.model_validate(
        {
            "return": payload.get("return", {}),
            "risk": payload.get("risk", {}),
            "trade": payload.get("trade", {}),
        }
    )


# -----------------------------------------------------------------------------
# LLM report
# -----------------------------------------------------------------------------
@router.get("/{run_id}/report", response_model=ReportResponse)
def get_report(run_id: int, db: Session = Depends(get_session)) -> ReportResponse:
    """Return the cached LLM report for this run, or 404 if none exists.

    No LLM call is ever made on GET — call POST to (re)generate.
    """
    if db.get(BacktestRun, run_id) is None:
        raise HTTPException(404, f"Run {run_id} not found")

    agent = ExplanationAgent(db)
    cached = agent.get_cached_report(run_id)
    if cached is None:
        raise HTTPException(404, "No report generated for this run yet")
    generated_at = agent.get_cached_report_timestamp(run_id)
    assert generated_at is not None  # guaranteed by get_cached_report returning non-None
    return ReportResponse(
        text=cached.text,
        model=cached.model,
        demo_mode=agent.is_demo_mode,
        generated_at=generated_at,
        cached=True,
        prompt_tokens=cached.prompt_tokens,
        completion_tokens=cached.completion_tokens,
    )


@router.post("/{run_id}/report", response_model=ReportResponse, status_code=201)
def generate_report(run_id: int, db: Session = Depends(get_session)) -> ReportResponse:
    """Generate a fresh LLM report and persist it. Used for both initial
    generation and 'Regenerate' — the cache lookup in GET always returns the
    most-recent assistant turn, so a new POST overwrites the visible report."""
    if db.get(BacktestRun, run_id) is None:
        raise HTTPException(404, f"Run {run_id} not found")

    agent = ExplanationAgent(db)
    try:
        result = agent.run(ExplanationAgentInput(op="report_run", run_id=run_id))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except AgentError as e:
        # Translate upstream LLM errors into the right HTTP status so the UI
        # can show a friendlier message ("provider overloaded, try again")
        # instead of a generic 500.
        cause = e.cause
        try:
            from google.genai import errors as genai_errors
        except ImportError:
            genai_errors = None  # type: ignore[assignment]
        if genai_errors is not None and isinstance(cause, genai_errors.APIError):
            status = getattr(cause, "code", None) or getattr(cause, "status_code", None)
            if status == 503:
                raise HTTPException(
                    503,
                    "LLM provider is currently overloaded. Try again in a few seconds.",
                ) from e
            if status == 429:
                raise HTTPException(429, "LLM provider rate-limited the request.") from e
            if status in (400, 404):
                raise HTTPException(int(status), str(cause)) from e
        raise HTTPException(502, f"LLM provider error: {cause}") from e

    generated_at = agent.get_cached_report_timestamp(run_id)
    assert generated_at is not None  # the run we just persisted is the newest row
    return ReportResponse(
        text=result.text,
        model=result.model,
        demo_mode=agent.is_demo_mode,
        generated_at=generated_at,
        cached=False,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
    )


@router.get("/{run_id}/report.pdf")
def get_report_pdf(run_id: int, db: Session = Depends(get_session)) -> Response:
    """Render the cached LLM report to a styled PDF download. 404 if none exists."""
    run = db.get(BacktestRun, run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")

    agent = ExplanationAgent(db)
    cached = agent.get_cached_report(run_id)
    if cached is None:
        raise HTTPException(404, "No report generated for this run yet")
    generated_at = agent.get_cached_report_timestamp(run_id)

    metrics = AnalyticsAgent(db).run(
        AnalyticsAgentInput(op="metrics", run_id=run_id)
    ).payload

    pdf = build_report_pdf(
        strategy_name=run.strategy.name,
        asset_symbol=run.asset.symbol,
        timeframe=run.timeframe,
        start_date=run.start_date,
        end_date=run.end_date,
        metrics=metrics,
        report_text=cached.text,
        model=cached.model,
        generated_at=generated_at,
        demo_mode=agent.is_demo_mode,
    )
    filename = pdf_filename(run.strategy.name, run.asset.symbol, generated_at)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
