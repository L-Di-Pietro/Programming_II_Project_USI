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
from backend.analytics.visualizations import (
    build_drawdown_figure,
    build_equity_figure,
    build_monthly_heatmap,
)
from backend.database.models import EquityPoint, Metric


ChartKind = Literal["equity", "drawdown", "heatmap"]


@dataclass(slots=True)
class AnalyticsAgentInput:
    op: str  # "metrics" | "chart"
    run_id: int
    chart: ChartKind | None = None


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
        equity = self._load_equity_series(run_id)
        if equity.empty:
            return {}
        if kind == "equity":
            return build_equity_figure(equity)
        if kind == "drawdown":
            return build_drawdown_figure(equity)
        if kind == "heatmap":
            return build_monthly_heatmap(equity)
        raise ValueError(f"Unknown chart kind: {kind!r}")

    # ------------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------------
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
