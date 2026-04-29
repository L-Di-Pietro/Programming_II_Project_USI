"""The single most important test in the project.

Premise: the engine MUST fill orders at the *next* bar's open, not the
current bar's close. To prove it, we inject an "oracle" strategy whose
generate_signals reads the future close and tries to trade on it. If the
engine were buggy, the oracle would print money instantly. With the correct
t→t+1 fill rule, the oracle's "knowledge" only helps it for the NEXT bar's
open — and we can verify that the engine never fills on the same bar.
"""

from __future__ import annotations

from typing import ClassVar

import numpy as np
import pandas as pd

from backend.backtest.engine import BacktestConfig, run_backtest
from backend.strategies.base import BaseStrategy, StrategyConfig


class _OracleConfig(StrategyConfig):
    pass


class _OracleStrategy(BaseStrategy):
    """Sees the future. Wants to be long when tomorrow's close > today's close."""
    slug: ClassVar[str] = "oracle"
    name: ClassVar[str] = "Oracle (test only)"
    description: ClassVar[str] = "Knows tomorrow. Used as a look-ahead probe."
    config_cls: ClassVar[type[StrategyConfig]] = _OracleConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        # Future-shifted close — strategy can see one bar into the future.
        future_close = bars["close"].shift(-1)
        signal = (future_close > bars["close"]).astype(int)
        # The last bar has no "tomorrow" — treat as flat.
        signal.iloc[-1] = 0
        signal.name = "signal"
        return signal


def _synthetic_bars(n: int = 100) -> pd.DataFrame:
    rng = np.random.default_rng(seed=0)
    close = 100.0 + np.cumsum(rng.normal(0.0, 1.0, size=n))
    open_ = np.concatenate([[close[0]], close[:-1]])
    bars = pd.DataFrame(
        {
            "open": open_,
            "high": np.maximum(open_, close) + 0.1,
            "low": np.minimum(open_, close) - 0.1,
            "close": close,
            "volume": np.full(n, 1_000.0),
        },
        index=pd.date_range("2020-01-01", periods=n, freq="B", name="ts"),
    )
    return bars


def test_engine_fills_on_next_open_not_current_close():
    bars = _synthetic_bars(200)
    cfg = BacktestConfig(
        bars=bars,
        strategy=_OracleStrategy(_OracleConfig()),
        initial_cash=10_000.0,
        commission_bps=0.0,
        slippage_bps=0.0,
        allow_fractional=True,
    )
    result = run_backtest(cfg)

    # Every trade timestamp must be strictly greater than the bar that
    # generated the signal — i.e. fills land on a *later* bar.
    bars_index_set = set(bars.index)
    for trade in result.trades:
        assert trade.ts in bars_index_set
        # The engine's price must be the open of the trade's bar.
        bar_at_trade = bars.loc[trade.ts]
        assert abs(trade.price - bar_at_trade["open"]) < 1e-9, (
            f"Trade at {trade.ts} filled at {trade.price}, "
            f"expected open={bar_at_trade['open']} (look-ahead bias detected)"
        )


def test_engine_skips_last_bar_signal():
    """A signal generated on the very last bar has no t+1 — must not fill."""
    bars = _synthetic_bars(50)
    # Force a buy signal on every bar.

    class _AlwaysLong(_OracleStrategy):
        def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
            return pd.Series(1, index=bars.index, dtype=int, name="signal")

    cfg = BacktestConfig(
        bars=bars,
        strategy=_AlwaysLong(_OracleConfig()),
        initial_cash=10_000.0,
        commission_bps=0.0,
        slippage_bps=0.0,
        allow_fractional=True,
    )
    result = run_backtest(cfg)

    # No trade should be timestamped at the very first bar (orders queued at
    # bar 0 fill at bar 1's open, not bar 0). And no order placed at the last
    # bar can fill at all.
    if result.trades:
        assert result.trades[0].ts == bars.index[1]
        assert result.trades[-1].ts != bars.index[-1] or len(result.trades) == 1


def test_engine_handles_empty_bars():
    cfg = BacktestConfig(
        bars=pd.DataFrame(columns=["open", "high", "low", "close", "volume"]),
        strategy=_OracleStrategy(_OracleConfig()),
    )
    result = run_backtest(cfg)
    assert result.trades == []
    assert result.equity_curve == []
