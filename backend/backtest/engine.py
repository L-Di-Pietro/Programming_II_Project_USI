"""BacktestEngine — the event-driven core.

CRITICAL invariant: **no look-ahead bias**.
At bar ``t`` the strategy sees data ≤ ``t``. If it wants to change its
position, the order is queued and fills at the **open of bar t+1**, after
slippage and commission are applied. This is enforced here, not in
strategies.

The unit test ``tests/test_engine_no_lookahead.py`` injects an oracle
strategy that knows the future close and asserts it cannot trade at bar
``t``'s close.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd
import structlog

from backend.backtest.execution import ExecutionHandler, FillResult
from backend.backtest.portfolio import Portfolio
from backend.backtest.risk import RiskManager, SizingMode
from backend.strategies.base import BaseStrategy

log = structlog.get_logger(__name__)


# -----------------------------------------------------------------------------
# Public dataclasses
# -----------------------------------------------------------------------------
@dataclass(slots=True)
class BacktestConfig:
    """Everything needed to reproduce a run."""

    bars: pd.DataFrame                  # OHLCV indexed by tz-naive UTC datetime
    strategy: BaseStrategy
    initial_cash: float = 10_000.0
    commission_bps: float = 5.0         # 0.05 %
    slippage_bps: float = 2.0           # 0.02 %
    sizing_mode: SizingMode = SizingMode.FIXED_FRACTION
    risk_fraction: float = 1.0
    vol_target_annual: float = 0.20
    vol_lookback: int = 20
    max_dd_pct: float | None = None
    allow_fractional: bool = False


@dataclass(slots=True)
class TradeRecord:
    ts: datetime
    side: str           # 'buy' / 'sell'
    qty: float
    price: float        # post-slippage fill price
    commission: float
    slippage_cost: float
    gross_pnl: float
    net_pnl: float


@dataclass(slots=True)
class EquityRecord:
    ts: datetime
    equity: float
    cash: float
    position_value: float
    drawdown_pct: float


@dataclass(slots=True)
class BacktestResult:
    """All outputs needed by Analytics + persistence."""
    trades: list[TradeRecord] = field(default_factory=list)
    equity_curve: list[EquityRecord] = field(default_factory=list)


# -----------------------------------------------------------------------------
# Engine
# -----------------------------------------------------------------------------
class BacktestEngine:
    """Bar-by-bar event loop with strict t→t+1 fill semantics."""

    def __init__(self, config: BacktestConfig) -> None:
        self.config = config
        self.portfolio = Portfolio(initial_cash=config.initial_cash)
        self.executor = ExecutionHandler(
            slippage_bps=config.slippage_bps,
            commission_bps=config.commission_bps,
        )
        self.risk = RiskManager(
            sizing_mode=config.sizing_mode,
            risk_fraction=config.risk_fraction,
            vol_target_annual=config.vol_target_annual,
            vol_lookback=config.vol_lookback,
            max_dd_pct=config.max_dd_pct,
            allow_fractional=config.allow_fractional,
        )

    def run(self) -> BacktestResult:
        bars = self.config.bars
        if bars.empty:
            return BacktestResult()

        log.info("engine.start", bars=len(bars), strategy=self.config.strategy.slug)

        signals = self.config.strategy.generate_signals(bars)
        if len(signals) != len(bars):
            raise RuntimeError(
                f"Strategy returned {len(signals)} signals for {len(bars)} bars"
            )

        result = BacktestResult()
        peak_equity = self.config.initial_cash

        # We need bar t+1's open to fill an order placed at bar t. So we
        # iterate up to the second-to-last bar (the last bar's signal would
        # have nowhere to fill — strategy can't trade on the last bar).
        n = len(bars)
        for t in range(n):
            bar = bars.iloc[t]
            # 1. Mark-to-market on this bar's close.
            self.portfolio.mark_to_market(float(bar["close"]))

            # 2. Update peak + drawdown for the equity record.
            peak_equity = max(peak_equity, self.portfolio.equity)
            drawdown_pct = (
                0.0 if peak_equity <= 0 else (1.0 - self.portfolio.equity / peak_equity) * 100.0
            )

            # 3. Record equity point.
            result.equity_curve.append(
                EquityRecord(
                    ts=bars.index[t].to_pydatetime(),
                    equity=self.portfolio.equity,
                    cash=self.portfolio.cash,
                    position_value=self.portfolio.position_value,
                    drawdown_pct=drawdown_pct,
                )
            )

            # 4. Strategy & risk decide what they *want* to do at end-of-bar t.
            target = int(signals.iloc[t])
            side, qty = self.risk.size_order(self.portfolio, target, bars, t)
            if side == 0 or qty <= 0:
                continue

            # 5. The fill happens at bar t+1's open. If we're on the last bar
            #    there is no t+1 — skip the order entirely. This is the
            #    look-ahead-bias guarantee.
            if t + 1 >= n:
                break

            next_open = float(bars["open"].iloc[t + 1])
            fill = self.executor.fill(side=side, qty=qty, reference_price=next_open)
            self._record_fill(result, fill, ts=bars.index[t + 1].to_pydatetime())

        log.info(
            "engine.done",
            trades=len(result.trades),
            final_equity=self.portfolio.equity,
        )
        return result

    # ------------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------------
    def _record_fill(self, result: BacktestResult, fill: FillResult, ts: datetime) -> None:
        gross_pnl, net_pnl = self.portfolio.apply_fill(
            side=fill.side,
            qty=fill.qty,
            fill_price=fill.fill_price,
            commission=fill.commission,
        )
        result.trades.append(
            TradeRecord(
                ts=ts,
                side="buy" if fill.side == 1 else "sell",
                qty=fill.qty,
                price=fill.fill_price,
                commission=fill.commission,
                slippage_cost=fill.slippage_cost,
                gross_pnl=gross_pnl,
                net_pnl=net_pnl,
            )
        )


# -----------------------------------------------------------------------------
# Convenience function
# -----------------------------------------------------------------------------
def run_backtest(config: BacktestConfig) -> BacktestResult:
    """One-line entrypoint: ``run_backtest(BacktestConfig(...))``."""
    return BacktestEngine(config).run()
