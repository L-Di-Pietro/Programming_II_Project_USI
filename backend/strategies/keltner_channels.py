"""Keltner Channels — volatility envelope around an EMA.

Logic
-----
* middle = EMA(close, ``ema_period``)
* ATR    = Wilder-smoothed true range over ``atr_period``
* upper  = middle + ``multiplier`` * ATR
* lower  = middle − ``multiplier`` * ATR

Breakout mode (default):
  * Enter long  when close > upper. Exit long  when close < middle.
  * Enter short (if ``allow_short``) when close < lower. Exit when close > middle.

Mean-reversion mode: inverted — buy lower-band touches, sell upper-band
touches, exit when price returns to the midline.

Citations
---------
Keltner, C. W. (1960). *How to Make Money in Commodities*. Keltner Statistical Service.
ATR-based variant popularised in *Stocks & Commodities* by Linda Bradford Raschke (1990s).
"""

from __future__ import annotations

from typing import ClassVar, Literal

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class KeltnerChannelsConfig(StrategyConfig):
    ema_period: int = Field(
        default=20, ge=2, le=200, description="EMA span for the channel midline."
    )
    atr_period: int = Field(
        default=10,
        ge=2,
        le=200,
        description="ATR lookback (Wilder smoothing).",
    )
    multiplier: float = Field(
        default=2.0,
        ge=0.1,
        le=10.0,
        description="ATR multiplier for the channel width.",
    )
    allow_short: bool = Field(
        default=True, description="Trade the short side symmetrically."
    )
    mode: Literal["breakout", "mean_reversion"] = Field(
        default="breakout",
        description=(
            "'breakout' rides upper-band breaks; "
            "'mean_reversion' fades them and buys lower-band touches."
        ),
    )


class KeltnerChannelsStrategy(BaseStrategy):
    """Volatility-band breakout or mean-reversion."""

    slug: ClassVar[str] = "keltner-channels"
    name: ClassVar[str] = "Keltner Channels"
    category: ClassVar[str] = "Breakout"
    description: ClassVar[str] = (
        "Builds ATR-scaled bands around an EMA. In breakout mode, goes long on "
        "an upper-band break and exits when price returns to the midline; "
        "mean-reversion mode inverts the logic. Adapts band width to recent "
        "volatility so the same parameters work across regimes."
    )
    config_cls: ClassVar[type[StrategyConfig]] = KeltnerChannelsConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: KeltnerChannelsConfig = self.config  # type: ignore[assignment]
        high, low, close = bars["high"], bars["low"], bars["close"]

        prev_close = close.shift(1)
        true_range = pd.concat(
            [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
            axis=1,
        ).max(axis=1)
        # Wilder smoothing = EMA with alpha = 1/n, adjust=False.
        atr = true_range.ewm(alpha=1.0 / cfg.atr_period, adjust=False).mean()
        middle = close.ewm(span=cfg.ema_period, adjust=False).mean()
        upper = middle + cfg.multiplier * atr
        lower = middle - cfg.multiplier * atr

        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        position = 0
        c_arr = close.to_numpy()
        m_arr = middle.to_numpy()
        u_arr = upper.to_numpy()
        l_arr = lower.to_numpy()
        warmup = max(cfg.ema_period, cfg.atr_period) + 1

        for i in range(len(bars)):
            if i < warmup:
                signal.iloc[i] = 0
                continue
            px, m, up, lo = c_arr[i], m_arr[i], u_arr[i], l_arr[i]

            if cfg.mode == "breakout":
                if position == 0:
                    if px > up:
                        position = 1
                    elif px < lo and cfg.allow_short:
                        position = -1
                elif position == 1 and px < m or position == -1 and px > m:
                    position = 0
            else:  # mean_reversion
                if position == 0:
                    if px < lo:
                        position = 1
                    elif px > up and cfg.allow_short:
                        position = -1
                elif position == 1 and px > m or position == -1 and px < m:
                    position = 0

            signal.iloc[i] = position
        return signal
