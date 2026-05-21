"""Time Series Momentum — Moskowitz–Ooi–Pedersen.

Logic
-----
At each bar t, compute the trailing return over ``lookback_bars``:

    r_t = close[t] / close[t - lookback_bars] - 1

Target long if r_t > 0, short if r_t < 0 (and ``allow_short``), else flat.

The parameter is named ``lookback_bars`` (not ``_days``) because the framework
ingests both daily and hourly OHLCV — the unit is always *bars*, and the
"one-year" interpretation only holds when bars are daily.

Citations
---------
Moskowitz, T., Ooi, Y. H., & Pedersen, L. H. (2012). "Time Series Momentum."
*Journal of Financial Economics*, 104(2), 228–250.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class TimeSeriesMomentumConfig(StrategyConfig):
    lookback_bars: int = Field(
        default=252,
        ge=2,
        le=2520,
        description=(
            "Bars over which to measure the trailing return "
            "(≈ one year of daily bars at 252)."
        ),
    )
    allow_short: bool = Field(
        default=True, description="If true, short when trailing return is negative."
    )


class TimeSeriesMomentumStrategy(BaseStrategy):
    """Sign of the trailing N-bar return drives the target position."""

    slug: ClassVar[str] = "time-series-momentum"
    name: ClassVar[str] = "Time Series Momentum"
    category: ClassVar[str] = "Momentum"
    description: ClassVar[str] = (
        "Goes long if the trailing N-bar return is positive and short if it is "
        "negative. Implements the Moskowitz–Ooi–Pedersen finding that an asset's "
        "own past return predicts its future return over horizons of 1–12 months."
    )
    config_cls: ClassVar[type[StrategyConfig]] = TimeSeriesMomentumConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: TimeSeriesMomentumConfig = self.config  # type: ignore[assignment]
        close = bars["close"]

        trailing_return = close.pct_change(periods=cfg.lookback_bars)

        long_signal = (trailing_return > 0).astype(int)
        if cfg.allow_short:
            short_signal = (trailing_return < 0).astype(int) * -1
            signal = long_signal + short_signal
        else:
            signal = long_signal

        # Bars before the lookback completes have NaN return → clamp to flat.
        signal = signal.where(trailing_return.notna(), other=0).astype(int)
        signal.name = "signal"
        return signal
