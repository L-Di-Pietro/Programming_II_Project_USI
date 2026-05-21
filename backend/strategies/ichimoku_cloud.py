"""Ichimoku Kinkō Hyō — multi-component trend overlay.

Logic
-----
Ichimoku assembles a single picture from five components:

* Tenkan-sen    = (rolling-max(high, 9)  + rolling-min(low, 9))  / 2
* Kijun-sen     = (rolling-max(high, 26) + rolling-min(low, 26)) / 2
* Senkou Span A = (Tenkan + Kijun) / 2,                              shifted forward 26 bars
* Senkou Span B = (rolling-max(high, 52) + rolling-min(low, 52)) / 2, shifted forward 26 bars
* Cloud top     = max(Senkou A, Senkou B);   Cloud bottom = min(...)

Forward-shift = ``.shift(+displacement)``. This means the cloud value at index
*t* was computed from bars at index *t − displacement*, so reading the cloud
at time *t* never leaks future information.

Signal:
  * Long  if close > cloud top    AND Tenkan > Kijun.
  * Short if close < cloud bottom AND Tenkan < Kijun (when ``allow_short``).
  * Otherwise flat.

Citations
---------
Hosoda, G. (1969). *Ichimoku Kinkō Hyō*. Tokyo.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class IchimokuCloudConfig(StrategyConfig):
    tenkan_period: int = Field(
        default=9, ge=2, le=200, description="Tenkan-sen lookback (bars)."
    )
    kijun_period: int = Field(
        default=26, ge=3, le=400, description="Kijun-sen lookback (bars)."
    )
    senkou_b_period: int = Field(
        default=52, ge=5, le=600, description="Senkou Span B lookback (bars)."
    )
    displacement: int = Field(
        default=26,
        ge=1,
        le=200,
        description="Bars by which to displace the cloud forward.",
    )
    allow_short: bool = Field(
        default=True,
        description="If true, short below the cloud when Tenkan < Kijun.",
    )


class IchimokuCloudStrategy(BaseStrategy):
    """Trend follower using the Ichimoku cloud and Tenkan/Kijun confirmation."""

    slug: ClassVar[str] = "ichimoku-cloud"
    name: ClassVar[str] = "Ichimoku Cloud"
    category: ClassVar[str] = "Trend Following"
    description: ClassVar[str] = (
        "Goes long when price trades above the projected cloud with the Tenkan "
        "above the Kijun, and short when both conditions invert. Combines "
        "multi-horizon trend filters into a single 'cloud' that adapts to volatility."
    )
    config_cls: ClassVar[type[StrategyConfig]] = IchimokuCloudConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: IchimokuCloudConfig = self.config  # type: ignore[assignment]
        high, low, close = bars["high"], bars["low"], bars["close"]

        def midpoint(window: int) -> pd.Series:
            return (
                high.rolling(window=window, min_periods=window).max()
                + low.rolling(window=window, min_periods=window).min()
            ) / 2.0

        tenkan = midpoint(cfg.tenkan_period)
        kijun = midpoint(cfg.kijun_period)
        senkou_a = ((tenkan + kijun) / 2.0).shift(cfg.displacement)
        senkou_b = midpoint(cfg.senkou_b_period).shift(cfg.displacement)

        cloud_top = pd.concat([senkou_a, senkou_b], axis=1).max(axis=1)
        cloud_bottom = pd.concat([senkou_a, senkou_b], axis=1).min(axis=1)

        long_cond = (close > cloud_top) & (tenkan > kijun)
        short_cond = (close < cloud_bottom) & (tenkan < kijun)

        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        signal[long_cond.fillna(False)] = 1
        if cfg.allow_short:
            signal[short_cond.fillna(False)] = -1

        # Warm-up: the cloud requires senkou_b_period bars of history *plus*
        # `displacement` bars before it appears at the current index.
        warmup = cfg.senkou_b_period + cfg.displacement
        if warmup < len(signal):
            signal.iloc[:warmup] = 0
        else:
            signal.iloc[:] = 0
        return signal.astype(int)
