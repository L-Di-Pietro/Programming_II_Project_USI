"""RSI Mean Reversion — buy oversold, sell overbought.

Logic
-----
Compute Wilder's Relative Strength Index (RSI). Standard convention:

* RSI < oversold_threshold (default 30)   → market overshot to the downside,
                                              expect a bounce → enter long.
* RSI > overbought_threshold (default 70) → market overshot up, expect a
                                              pullback → exit (or short).

This is a counter-trend strategy: it bets *against* the recent move. It
makes small frequent profits in range-bound markets and absorbs large
losses during breakouts (the opposite character to SMA crossover).

Citations
---------
Wilder, J. W. (1978). *New Concepts in Technical Trading Systems*.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class RSIMeanReversionConfig(StrategyConfig):
    rsi_window: int = Field(default=14, ge=2, le=100, description="RSI lookback period (bars).")
    oversold_threshold: float = Field(
        default=30.0, ge=0.0, le=50.0, description="Long-entry RSI threshold."
    )
    overbought_threshold: float = Field(
        default=70.0, ge=50.0, le=100.0, description="Long-exit RSI threshold."
    )
    allow_short: bool = Field(
        default=False, description="If true, also short when RSI > overbought."
    )


class RSIMeanReversionStrategy(BaseStrategy):
    """Counter-trend: long when RSI is oversold, flat/short when overbought."""

    slug: ClassVar[str] = "rsi-mean-reversion"
    name: ClassVar[str] = "RSI Mean Reversion"
    description: ClassVar[str] = (
        "Counter-trend strategy that buys oversold conditions (RSI below a "
        "low threshold) and exits when RSI returns to overbought territory. "
        "Profits in range-bound markets; struggles during sustained trends."
    )
    config_cls: ClassVar[type[StrategyConfig]] = RSIMeanReversionConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: RSIMeanReversionConfig = self.config  # type: ignore[assignment]
        if cfg.overbought_threshold <= cfg.oversold_threshold:
            raise ValueError("overbought_threshold must exceed oversold_threshold")

        rsi = self._rsi(bars["close"], cfg.rsi_window)

        # Stateful entry/exit: enter long when RSI dips below oversold, hold
        # until RSI exceeds overbought. Implementing as a stateful loop keeps
        # the semantics clean; pandas-only versions are surprisingly tricky
        # for "hold until exit" logic.
        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        position = 0
        for i, value in enumerate(rsi.to_numpy()):
            if pd.isna(value):
                signal.iloc[i] = 0
                continue
            if position == 0 and value < cfg.oversold_threshold:
                position = 1
            elif position == 1 and value > cfg.overbought_threshold:
                position = -1 if cfg.allow_short else 0
            elif position == -1 and value < cfg.oversold_threshold:
                position = 1
            signal.iloc[i] = position
        return signal

    @staticmethod
    def _rsi(close: pd.Series, window: int) -> pd.Series:
        """Wilder's RSI.

        RSI = 100 − 100 / (1 + RS),  where  RS = avg_gain / avg_loss.
        Averages use Wilder's smoothing (α = 1/window) — equivalent to an EMA
        with span = 2*window − 1.
        """
        delta = close.diff()
        gain = delta.clip(lower=0.0)
        loss = (-delta).clip(lower=0.0)

        avg_gain = gain.ewm(alpha=1.0 / window, adjust=False, min_periods=window).mean()
        avg_loss = loss.ewm(alpha=1.0 / window, adjust=False, min_periods=window).mean()

        # Avoid division by zero — when avg_loss is 0, RSI is 100.
        rs = avg_gain / avg_loss.replace(0.0, pd.NA)
        rsi = 100.0 - 100.0 / (1.0 + rs)
        return rsi.fillna(100.0).clip(0.0, 100.0)
