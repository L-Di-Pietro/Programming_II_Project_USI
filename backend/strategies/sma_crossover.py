"""SMA Crossover — the canonical trend-following strategy.

Logic
-----
Compute two simple moving averages of the close: a fast one (default 20
bars) and a slow one (default 50 bars). When the fast SMA is above the slow
SMA, the trend is "up" — target a long position. Otherwise stay flat (or
short, if shorting is enabled).

Why it works (when it works)
----------------------------
SMAs are low-pass filters. Their crossover identifies persistent regime
shifts in price. The strategy makes money when prices trend; it gives up
small "whipsaw" losses in choppy markets and large gains during big trends.

Citations
---------
Pardo (2008), §4.2 — "The Moving Average Crossover".
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class SMACrossoverConfig(StrategyConfig):
    """Parameters for SMACrossoverStrategy."""

    fast_window: int = Field(
        default=20,
        ge=2,
        le=200,
        description="Lookback (bars) for the fast SMA.",
    )
    slow_window: int = Field(
        default=50,
        ge=5,
        le=500,
        description="Lookback (bars) for the slow SMA. Must exceed fast_window.",
    )
    allow_short: bool = Field(
        default=False,
        description="If true, hold a short position when fast SMA is below slow SMA.",
    )


class SMACrossoverStrategy(BaseStrategy):
    """Trend-following: long when fast SMA > slow SMA."""

    slug: ClassVar[str] = "sma-crossover"
    name: ClassVar[str] = "SMA Crossover"
    description: ClassVar[str] = (
        "Classic trend-following strategy: go long when a fast moving average "
        "crosses above a slow one, exit (or short) when it crosses back below. "
        "Performs best in markets with sustained directional moves; "
        "vulnerable to whipsaw in sideways markets."
    )
    config_cls: ClassVar[type[StrategyConfig]] = SMACrossoverConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: SMACrossoverConfig = self.config  # type: ignore[assignment]
        if cfg.slow_window <= cfg.fast_window:
            raise ValueError("slow_window must be strictly greater than fast_window")

        close = bars["close"]

        # Simple moving averages — pandas handles the rolling window.
        fast = close.rolling(window=cfg.fast_window, min_periods=cfg.fast_window).mean()
        slow = close.rolling(window=cfg.slow_window, min_periods=cfg.slow_window).mean()

        # Where fast > slow, target long. Otherwise either flat or short.
        long_signal = (fast > slow).astype(int)
        if cfg.allow_short:
            short_signal = (fast < slow).astype(int) * -1
            signal = long_signal + short_signal  # 1 / 0 / -1
        else:
            signal = long_signal  # 1 / 0

        # During the warm-up period the SMAs are NaN, so we cannot infer a
        # signal — explicitly mark those bars as "flat" (0).
        signal = signal.where(slow.notna(), other=0).astype(int)
        signal.name = "signal"
        return signal
