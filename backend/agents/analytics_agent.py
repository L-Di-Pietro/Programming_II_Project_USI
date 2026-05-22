"""AnalyticsAgent — assembles charts + metric snapshots from a stored run.

The BacktestAgent already persists per-row metrics. This agent's job is to
*present* them: build Plotly figure JSON, format the metric dict for the
API, and (in the future) produce comparison views across runs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.base import BaseAgent
from backend.analytics.metrics import compute_metrics
from backend.analytics.periods import periods_per_year
from backend.analytics.visualizations import (
    build_drawdown_figure,
    build_equity_figure,
    build_monthly_heatmap,
    build_rolling_sharpe_figure,
    build_trade_pnl_figure,
)
from backend.database.models import (
    Asset,
    BacktestRun,
    BenchmarkEquityPoint,
    EquityPoint,
    Metric,
    Trade,
)

ChartKind = Literal["equity", "drawdown", "heatmap", "trade_pnl", "rolling_sharpe"]


@dataclass(slots=True)
class AnalyticsAgentInput:
    op: str  # "metrics" | "chart" | "benchmark_metrics"
    run_id: int
    chart: ChartKind | None = None
    benchmark_kind: str | None = None  # BenchmarkKind value, for benchmark_metrics


@dataclass(slots=True)
class AnalyticsAgentOutput:
    op: str
    run_id: int
    payload: Any


class AnalyticsAgent(BaseAgent[AnalyticsAgentInput, AnalyticsAgentOutput]):
    name = "analytics"

    def __init__(self, db: Session) -> None:
        super().__init__()
        self.db = db

    def _run(self, payload: AnalyticsAgentInput) -> AnalyticsAgentOutput:
        if payload.op == "metrics":
            return AnalyticsAgentOutput(
                op="metrics",
                run_id=payload.run_id,
                payload=self._metrics(payload.run_id),
            )
        if payload.op == "chart":
            if payload.chart is None:
                raise ValueError("chart op requires a chart kind")
            return AnalyticsAgentOutput(
                op="chart",
                run_id=payload.run_id,
                payload=self._chart(payload.run_id, payload.chart),
            )
        if payload.op == "benchmark_metrics":
            if payload.benchmark_kind is None:
                raise ValueError("benchmark_metrics op requires a benchmark_kind")
            return AnalyticsAgentOutput(
                op="benchmark_metrics",
                run_id=payload.run_id,
                payload=self._benchmark_metrics(payload.run_id, payload.benchmark_kind),
            )
        raise ValueError(f"Unknown AnalyticsAgent op: {payload.op!r}")

    # ------------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------------
    def _metrics(self, run_id: int) -> dict[str, dict[str, float]]:
        """Return metrics grouped by category — UI-friendly shape."""
        rows = self.db.execute(
            select(Metric).where(Metric.run_id == run_id)
        ).scalars().all()
        out: dict[str, dict[str, float]] = {}
        for r in rows:
            out.setdefault(r.category, {})[r.metric_name] = r.value
        return out

    def _chart(self, run_id: int, kind: ChartKind) -> dict[str, Any]:
        if kind == "trade_pnl":
            net_pnl = self._load_net_pnl(run_id)
            return build_trade_pnl_figure(net_pnl)
        equity = self._load_equity_series(run_id)
        if equity.empty:
            return {}
        if kind == "equity":
            # Strategy-only by default. Benchmark overlays are fetched lazily
            # by the frontend via the /benchmark/{kind}/equity endpoints and
            # drawn client-side, so the user opts into them per the toggle bar.
            return build_equity_figure(equity)
        if kind == "drawdown":
            return build_drawdown_figure(equity)
        if kind == "heatmap":
            return build_monthly_heatmap(equity)
        if kind == "rolling_sharpe":
            return build_rolling_sharpe_figure(equity)
        raise ValueError(f"Unknown chart kind: {kind!r}")

    # ------------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------------
    def _load_net_pnl(self, run_id: int) -> list[float]:
        rows = self.db.execute(
            select(Trade).where(Trade.run_id == run_id).order_by(Trade.ts)
        ).scalars().all()
        return [r.net_pnl for r in rows]

    def _load_equity_series(self, run_id: int) -> pd.Series:
        rows = self.db.execute(
            select(EquityPoint)
            .where(EquityPoint.run_id == run_id)
            .order_by(EquityPoint.ts)
        ).scalars().all()
        if not rows:
            return pd.Series(dtype=float)
        return pd.Series(
            [r.equity for r in rows],
            index=pd.DatetimeIndex([r.ts for r in rows], name="ts"),
            name="equity",
        )

    def _load_benchmark_series(self, run_id: int) -> dict[str, pd.Series]:
        """Return ``{kind: equity_series}`` for every benchmark stored on this run."""
        rows = self.db.execute(
            select(BenchmarkEquityPoint)
            .where(BenchmarkEquityPoint.run_id == run_id)
            .order_by(BenchmarkEquityPoint.kind, BenchmarkEquityPoint.ts)
        ).scalars().all()
        if not rows:
            return {}
        by_kind: dict[str, list[BenchmarkEquityPoint]] = {}
        for r in rows:
            by_kind.setdefault(r.kind, []).append(r)
        return {
            kind: pd.Series(
                [r.equity for r in points],
                index=pd.DatetimeIndex([r.ts for r in points], name="ts"),
                name=kind,
            )
            for kind, points in by_kind.items()
        }

    def _benchmark_metrics(
        self, run_id: int, kind: str
    ) -> dict[str, dict[str, float]] | None:
        """Metrics for one persisted benchmark curve, grouped by category.

        Reuses the strategy's metrics computer on the stored benchmark equity
        series so the shape matches ``_metrics``. ``trade_pnls=None`` zeroes the
        trade block — a buy-and-hold benchmark doesn't actively trade. Returns
        ``None`` when the benchmark wasn't persisted for this run (the route
        turns that into a 404).
        """
        series = self._load_benchmark_series(run_id).get(kind)
        if series is None or series.empty:
            return None
        run = self.db.get(BacktestRun, run_id)
        if run is None:
            return None
        asset = self.db.get(Asset, run.asset_id)
        # Same annualisation factor as the strategy so the numbers line up.
        ppy = periods_per_year(run.timeframe, asset.asset_class) if asset else 252.0
        result = compute_metrics(equity=series, trade_pnls=None, periods_per_year=ppy)
        grouped: dict[str, dict[str, float]] = {}
        for name, value, category in result.as_long_rows():
            grouped.setdefault(category, {})[name] = float(value)
        return grouped
