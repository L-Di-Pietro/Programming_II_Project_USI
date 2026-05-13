"""Same oracle-strategy probe as test_engine_no_lookahead.py, but on hourly
bars. The t→t+1 fill invariant must hold at any timeframe.
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
    slug: ClassVar[str] = "oracle-hourly"
    name: ClassVar[str] = "Oracle Hourly (test only)"
    description: ClassVar[str] = "Knows the next hourly close."
    config_cls: ClassVar[type[StrategyConfig]] = _OracleConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        future_close = bars["close"].shift(-1)
        signal = (future_close > bars["close"]).astype(int)
        signal.iloc[-1] = 0
        signal.name = "signal"
        return signal


def _hourly_bars(n: int = 200) -> pd.DataFrame:
    rng = np.random.default_rng(seed=1)
    close = 100.0 + np.cumsum(rng.normal(0.0, 0.5, size=n))
    open_ = np.concatenate([[close[0]], close[:-1]])
    return pd.DataFrame(
        {
            "open": open_,
            "high": np.maximum(open_, close) + 0.1,
            "low": np.minimum(open_, close) - 0.1,
            "close": close,
            "volume": np.full(n, 1_000.0),
        },
        index=pd.date_range("2024-01-02 14:30", periods=n, freq="h", name="ts"),
    )


def test_engine_fills_on_next_open_hourly():
    bars = _hourly_bars(200)
    cfg = BacktestConfig(
        bars=bars,
        strategy=_OracleStrategy(_OracleConfig()),
        initial_cash=10_000.0,
        commission_bps=0.0,
        slippage_bps=0.0,
        allow_fractional=True,
        periods_per_year=1638.0,  # hourly NYSE
    )
    result = run_backtest(cfg)

    bars_index_set = set(bars.index)
    for trade in result.trades:
        assert trade.ts in bars_index_set
        bar_at_trade = bars.loc[trade.ts]
        assert abs(trade.price - bar_at_trade["open"]) < 1e-9, (
            f"Hourly trade at {trade.ts} filled at {trade.price}, "
            f"expected open={bar_at_trade['open']} (look-ahead bias)"
        )
