"""BacktestAgent — drives the engine and persists results.

Workflow
--------
1. Load OHLCV bars for (asset, date range) from the DB. Never hits external
   APIs — this is the reproducibility guarantee.
2. Build the strategy instance via the registry.
3. Run the engine.
4. Persist trades + equity curve + metrics.
5. Return the run id and a summary.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.base import BaseAgent
from backend.analytics.metrics import compute_metrics
from backend.backtest.engine import BacktestConfig, run_backtest
from backend.backtest.risk import SizingMode
from backend.database.models import (
    Asset,
    BacktestRun,
    EquityPoint,
    Metric,
    OHLCVBar,
    RunStatus,
    Strategy,
    Timeframe,
    Trade,
    TradeSide,
)
from backend.strategies import get_strategy


@dataclass(slots=True)
class BacktestAgentInput:
    asset_id: int
    strategy_slug: str
    start_date: datetime
    end_date: datetime
    params: dict[str, object] | None = None
    initial_cash: float = 10_000.0
    commission_bps: float = 5.0
    slippage_bps: float = 2.0
    sizing_mode: SizingMode = SizingMode.FIXED_FRACTION
    risk_fraction: float = 1.0
    timeframe: str = Timeframe.DAILY
    allow_fractional: bool = False
    max_dd_pct: float | None = None


@dataclass(slots=True)
class BacktestAgentOutput:
    run_id: int
    final_equity: float
    total_trades: int


class BacktestAgent(BaseAgent[BacktestAgentInput, BacktestAgentOutput]):
    name = "backtest"

    def __init__(self, db: Session) -> None:
        super().__init__()
        self.db = db

    def _run(self, payload: BacktestAgentInput) -> BacktestAgentOutput:
        # 1. Persist a "running" row so the API can poll status while we work.
        run = self._create_run_row(payload)

        try:
            # 2. Load bars from DB.
            bars = self._load_bars(payload.asset_id, payload.timeframe, payload.start_date, payload.end_date)
            if bars.empty:
                raise RuntimeError(
                    f"No OHLCV bars in DB for asset_id={payload.asset_id} "
                    f"({payload.start_date.date()} → {payload.end_date.date()}). "
                    f"Run scripts/load_initial_data.py or POST /assets/{{symbol}}/refresh."
                )

            # 3. Build strategy.
            strategy_cls = get_strategy(payload.strategy_slug)
            strategy = strategy_cls(strategy_cls.config_cls.model_validate(payload.params or {}))

            # 4. Run engine.
            cfg = BacktestConfig(
                bars=bars,
                strategy=strategy,
                initial_cash=payload.initial_cash,
                commission_bps=payload.commission_bps,
                slippage_bps=payload.slippage_bps,
                sizing_mode=payload.sizing_mode,
                risk_fraction=payload.risk_fraction,
                allow_fractional=payload.allow_fractional,
                max_dd_pct=payload.max_dd_pct,
            )
            result = run_backtest(cfg)

            # 5. Persist outputs.
            self._persist_trades(run.id, result.trades)
            self._persist_equity(run.id, result.equity_curve)
            self._persist_metrics(run.id, result)

            run.status = RunStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            self.db.commit()

            return BacktestAgentOutput(
                run_id=run.id,
                final_equity=result.equity_curve[-1].equity if result.equity_curve else 0.0,
                total_trades=len(result.trades),
            )
        except Exception as e:
            run.status = RunStatus.FAILED
            run.error_message = str(e)
            run.completed_at = datetime.utcnow()
            self.db.commit()
            raise

    # ------------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------------
    def _create_run_row(self, payload: BacktestAgentInput) -> BacktestRun:
        strategy_row = self.db.execute(
            select(Strategy).where(Strategy.slug == payload.strategy_slug)
        ).scalar_one_or_none()
        if strategy_row is None:
            raise ValueError(
                f"Strategy {payload.strategy_slug!r} not found in DB. "
                "Run scripts/init_db.py to seed the registry."
            )

        run = BacktestRun(
            strategy_id=strategy_row.id,
            asset_id=payload.asset_id,
            timeframe=payload.timeframe,
            start_date=payload.start_date,
            end_date=payload.end_date,
            params=payload.params or {},
            commission_bps=payload.commission_bps,
            slippage_bps=payload.slippage_bps,
            initial_cash=payload.initial_cash,
            status=RunStatus.RUNNING,
            created_at=datetime.utcnow(),
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def _load_bars(
        self, asset_id: int, timeframe: str, start: datetime, end: datetime
    ) -> pd.DataFrame:
        rows = self.db.execute(
            select(OHLCVBar)
            .where(
                OHLCVBar.asset_id == asset_id,
                OHLCVBar.timeframe == timeframe,
                OHLCVBar.ts >= start,
                OHLCVBar.ts <= end,
            )
            .order_by(OHLCVBar.ts)
        ).scalars().all()
        if not rows:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
        df = pd.DataFrame(
            {
                "open": [r.open for r in rows],
                "high": [r.high for r in rows],
                "low": [r.low for r in rows],
                "close": [r.close for r in rows],
                "volume": [r.volume for r in rows],
            },
            index=pd.DatetimeIndex([r.ts for r in rows], name="ts"),
        )
        return df

    def _persist_trades(self, run_id: int, trades: list) -> None:
        if not trades:
            return
        self.db.bulk_save_objects(
            [
                Trade(
                    run_id=run_id,
                    ts=t.ts,
                    side=TradeSide.BUY if t.side == "buy" else TradeSide.SELL,
                    qty=t.qty,
                    price=t.price,
                    commission=t.commission,
                    slippage_cost=t.slippage_cost,
                    gross_pnl=t.gross_pnl,
                    net_pnl=t.net_pnl,
                )
                for t in trades
            ]
        )
        self.db.commit()

    def _persist_equity(self, run_id: int, equity: list) -> None:
        if not equity:
            return
        self.db.bulk_save_objects(
            [
                EquityPoint(
                    run_id=run_id,
                    ts=e.ts,
                    equity=e.equity,
                    cash=e.cash,
                    position_value=e.position_value,
                    drawdown_pct=e.drawdown_pct,
                )
                for e in equity
            ]
        )
        self.db.commit()

    def _persist_metrics(self, run_id: int, result) -> None:
        # Build equity Series + trade-PnL Series for the metrics function.
        equity = pd.Series(
            [e.equity for e in result.equity_curve],
            index=pd.DatetimeIndex([e.ts for e in result.equity_curve], name="ts"),
        )
        trade_pnls = pd.Series([t.net_pnl for t in result.trades]) if result.trades else None

        metrics = compute_metrics(equity=equity, trade_pnls=trade_pnls)
        rows = [
            Metric(run_id=run_id, metric_name=name, value=float(value), category=cat)
            for name, value, cat in metrics.as_long_rows()
        ]
        self.db.bulk_save_objects(rows)
        self.db.commit()
