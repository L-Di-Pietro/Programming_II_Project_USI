"""MACD Crossover — momentum-aware trend follower.

Logic
-----
Compute the MACD line as the difference of two exponential moving averages of
the close: a fast EMA (default 12) and a slow EMA (default 26). Smooth the
MACD line with a third EMA (default 9) to obtain the signal line.

* MACD > signal line → upward momentum confirmed → target long.
* MACD < signal line → downward momentum confirmed → flat (or short).

Compared with a raw moving-average crossover, the second smoothing layer
dampens whipsaw in noisy regimes at the cost of a small additional lag.

Citations
---------
Appel, G. (2005). *Technical Analysis: Power Tools for Active Investors*. FT Press.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class MACDCrossoverConfig(StrategyConfig):
    fast_period: int = Field(
        default=12, ge=2, le=200, description="Fast EMA span."
    )
    slow_period: int = Field(
        default=26,
        ge=3,
        le=400,
        description="Slow EMA span. Must exceed fast_period.",
    )
    signal_period: int = Field(
        default=9, ge=2, le=100, description="Signal-line EMA span."
    )
    allow_short: bool = Field(
        default=True, description="If true, short when MACD < signal line."
    )


class MACDCrossoverStrategy(BaseStrategy):
    """Trend-following via MACD vs signal-line crossover."""

    slug: ClassVar[str] = "macd-crossover"
    name: ClassVar[str] = "MACD Crossover"
    category: ClassVar[str] = "Trend Following"
    description: ClassVar[str] = (
        "Goes long when the MACD line crosses above its signal line and flat "
        "(or short) when it crosses below. Captures momentum shifts with a "
        "smoothing layer that dampens whipsaw versus a raw moving-average crossover."
    )
    config_cls: ClassVar[type[StrategyConfig]] = MACDCrossoverConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: MACDCrossoverConfig = self.config  # type: ignore[assignment]
        if cfg.slow_period <= cfg.fast_period:
            raise ValueError("slow_period must be strictly greater than fast_period")

        close = bars["close"]
        ema_fast = close.ewm(span=cfg.fast_period, adjust=False).mean()
        ema_slow = close.ewm(span=cfg.slow_period, adjust=False).mean()
        macd = ema_fast - ema_slow
        signal_line = macd.ewm(span=cfg.signal_period, adjust=False).mean()

        long_signal = (macd > signal_line).astype(int)
        if cfg.allow_short:
            short_signal = (macd < signal_line).astype(int) * -1
            signal = long_signal + short_signal
        else:
            signal = long_signal

        # Warm-up: the slow EMA and signal-line EMA need enough bars to stabilise.
        warmup = cfg.slow_period + cfg.signal_period
        if warmup < len(signal):
            signal.iloc[:warmup] = 0
        else:
            signal.iloc[:] = 0
        signal = signal.astype(int)
        signal.name = "signal"
        return signal
