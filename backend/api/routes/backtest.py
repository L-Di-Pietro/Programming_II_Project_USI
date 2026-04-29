"""Backtest routes — submit / list / inspect runs."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.analytics_agent import AnalyticsAgent, AnalyticsAgentInput
from backend.agents.backtest_agent import BacktestAgent, BacktestAgentInput
from backend.api.schemas import (
    BacktestRequest,
    BacktestSummary,
    ChartResponse,
    EquityPointOut,
    MetricsOut,
    TradeOut,
)
from backend.backtest.risk import SizingMode
from backend.database import get_session
from backend.database.models import Asset, BacktestRun, EquityPoint, Trade

router = APIRouter(prefix="/backtests", tags=["backtests"])


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
                allow_fractional=request.allow_fractional,
                max_dd_pct=request.max_dd_pct,
            )
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e)) from e

    # Return the latest run (just inserted by the agent) for this user/strategy combo.
    run = db.execute(
        select(BacktestRun).order_by(BacktestRun.id.desc()).limit(1)
    ).scalar_one()
    return run


# -----------------------------------------------------------------------------
# List + detail
# -----------------------------------------------------------------------------
@router.get("", response_model=list[BacktestSummary])
def list_backtests(
    limit: int = 50,
    db: Session = Depends(get_session),
) -> list[BacktestRun]:
    """List runs newest-first."""
    return (
        db.execute(select(BacktestRun).order_by(BacktestRun.id.desc()).limit(limit))
        .scalars()
        .all()
    )


@router.get("/{run_id}", response_model=BacktestSummary)
def get_backtest(run_id: int, db: Session = Depends(get_session)) -> BacktestRun:
    run = db.get(BacktestRun, run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")
    return run


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


_ChartKind = Literal["equity", "drawdown", "heatmap"]


@router.get("/{run_id}/charts/{kind}", response_model=ChartResponse)
def get_chart(
    run_id: int,
    kind: _ChartKind,
    db: Session = Depends(get_session),
) -> ChartResponse:
    agent = AnalyticsAgent(db)
    figure = agent.run(AnalyticsAgentInput(op="chart", run_id=run_id, chart=kind)).payload
    return ChartResponse(figure=figure)
