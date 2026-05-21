"""Stochastic Oscillator — Lane's oversold / overbought reversal model.

Logic
-----
* raw_K = 100 * (close − rolling-min(low, k_period)) /
                (rolling-max(high, k_period) − rolling-min(low, k_period))
* %K    = SMA(raw_K, ``smooth_k``)             # "slow %K"
* %D    = SMA(%K, ``d_period``)                # kept for completeness

Signal (state machine):
  * %K crosses up   through ``oversold``   → target  +1
  * %K crosses down through ``overbought`` → target  −1 if ``allow_short`` else 0
  * Otherwise → hold the previous target.

Citations
---------
Lane, G. C. (1984). "Lane's Stochastics."
*Technical Analysis of Stocks & Commodities*, 2(3).
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field, model_validator

from backend.strategies.base import BaseStrategy, StrategyConfig


class StochasticOscillatorConfig(StrategyConfig):
    k_period: int = Field(
        default=14,
        ge=2,
        le=200,
        description="%K lookback (highest-high / lowest-low window).",
    )
    d_period: int = Field(
        default=3,
        ge=1,
        le=50,
        description="%D smoothing window (kept for completeness; not used in signal).",
    )
    smooth_k: int = Field(
        default=3, ge=1, le=50, description="SMA smoothing applied to raw %K."
    )
    oversold: float = Field(
        default=20.0, ge=0.0, le=50.0, description="Lower trigger band."
    )
    overbought: float = Field(
        default=80.0, ge=50.0, le=100.0, description="Upper trigger band."
    )
    allow_short: bool = Field(
        default=True,
        description="If true, short when %K crosses down through overbought.",
    )

    @model_validator(mode="after")
    def _check_bands(self) -> StochasticOscillatorConfig:
        if self.oversold >= self.overbought:
            raise ValueError("oversold must be strictly less than overbought")
        return self


class StochasticOscillatorStrategy(BaseStrategy):
    """Mean-reversion via %K cross-throughs of oversold / overbought bands."""

    slug: ClassVar[str] = "stochastic-oscillator"
    name: ClassVar[str] = "Stochastic Oscillator"
    category: ClassVar[str] = "Mean Reversion"
    description: ClassVar[str] = (
        "Uses Lane's %K to detect when an asset is exhausted at oversold or "
        "overbought extremes. Enters long when %K crosses up out of oversold "
        "and (optionally) shorts when it crosses down out of overbought."
    )
    config_cls: ClassVar[type[StrategyConfig]] = StochasticOscillatorConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: StochasticOscillatorConfig = self.config  # type: ignore[assignment]
        high, low, close = bars["high"], bars["low"], bars["close"]

        lowest = low.rolling(window=cfg.k_period, min_periods=cfg.k_period).min()
        highest = high.rolling(window=cfg.k_period, min_periods=cfg.k_period).max()
        denom = (highest - lowest).replace(0.0, pd.NA)
        raw_k = 100.0 * (close - lowest) / denom
        k = raw_k.rolling(window=cfg.smooth_k, min_periods=cfg.smooth_k).mean()

        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        position = 0
        k_arr = k.to_numpy()
        prev: float | None = None
        for i in range(len(bars)):
            curr = k_arr[i]
            if pd.isna(curr) or prev is None or pd.isna(prev):
                prev = float(curr) if not pd.isna(curr) else None
                signal.iloc[i] = position
                continue

            crossed_up_oversold = prev < cfg.oversold <= curr
            crossed_down_overbought = prev > cfg.overbought >= curr

            if crossed_up_oversold:
                position = 1
            elif crossed_down_overbought:
                position = -1 if cfg.allow_short else 0

            signal.iloc[i] = position
            prev = float(curr)
        return signal
