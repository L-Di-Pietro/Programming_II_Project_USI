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
    build_rolling_sharpe_figure,
    build_trade_pnl_figure,
)
from backend.database.models import (
    Asset,
    BacktestRun,
    BenchmarkEquityPoint,
    BenchmarkKind,
    EquityPoint,
    Metric,
    Trade,
)


ChartKind = Literal["equity", "drawdown", "heatmap", "trade_pnl", "rolling_sharpe"]


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
        if kind == "trade_pnl":
            net_pnl = self._load_net_pnl(run_id)
            return build_trade_pnl_figure(net_pnl)
        equity = self._load_equity_series(run_id)
        if equity.empty:
            return {}
        if kind == "equity":
            benchmarks = self._load_benchmark_series(run_id)
            labels = self._benchmark_labels(run_id)
            return build_equity_figure(equity, benchmarks=benchmarks, benchmark_labels=labels)
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

    def _benchmark_labels(self, run_id: int) -> dict[str, str]:
        """Legend labels keyed by benchmark kind, including the asset symbol."""
        run = self.db.get(BacktestRun, run_id)
        if run is None:
            return {}
        asset = self.db.get(Asset, run.asset_id)
        symbol = asset.symbol if asset is not None else ""
        labels: dict[str, str] = {
            str(BenchmarkKind.SPY_BUYHOLD): "Buy & Hold SPY",
        }
        labels[str(BenchmarkKind.ASSET_BUYHOLD)] = (
            f"Buy & Hold {symbol}" if symbol else "Buy & Hold"
        )
        return labels
