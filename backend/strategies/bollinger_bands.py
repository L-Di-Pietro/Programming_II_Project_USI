"""Bollinger Band Mean Reversion — fade extremes around a moving mean.

Logic
-----
Compute a moving mean μ and standard deviation σ over a lookback window.
Define upper / lower bands at μ ± k·σ (default k = 2). Convention:

* Close < lower band  → unusually cheap → enter long.
* Close > upper band  → unusually expensive → exit long (or enter short).
* Close re-enters the band (returns to mean) → neutralise.

This is a volatility-adjusted cousin of RSI mean reversion. Bands widen
during turbulent regimes, tightening signals — that's the feature.

Citations
---------
Bollinger, J. (2001). *Bollinger on Bollinger Bands*.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class BollingerBandsConfig(StrategyConfig):
    window: int = Field(default=20, ge=2, le=200, description="Lookback for μ and σ.")
    num_std: float = Field(
        default=2.0, ge=0.5, le=5.0, description="Band width in standard deviations."
    )
    exit_at_mean: bool = Field(
        default=True,
        description=(
            "If true, exit when price returns to the moving mean. "
            "If false, exit when price tags the opposite band."
        ),
    )
    allow_short: bool = Field(default=False, description="Short above the upper band.")


class BollingerBandsStrategy(BaseStrategy):
    """Mean-reversion at ±k σ bands."""

    slug: ClassVar[str] = "bollinger-bands"
    name: ClassVar[str] = "Bollinger Bands Mean Reversion"
    description: ClassVar[str] = (
        "Mean-reversion strategy that buys when the close drops below the "
        "lower Bollinger band and exits when price returns toward the mean. "
        "Volatility-adjusted version of RSI mean reversion."
    )
    config_cls: ClassVar[type[StrategyConfig]] = BollingerBandsConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: BollingerBandsConfig = self.config  # type: ignore[assignment]
        close = bars["close"]

        mean = close.rolling(window=cfg.window, min_periods=cfg.window).mean()
        std = close.rolling(window=cfg.window, min_periods=cfg.window).std(ddof=0)
        upper = mean + cfg.num_std * std
        lower = mean - cfg.num_std * std

        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        position = 0
        for i, (px, m, lo, up) in enumerate(zip(close, mean, lower, upper)):
            if pd.isna(m):  # warm-up
                signal.iloc[i] = 0
                continue

            if position == 0:
                if px < lo:
                    position = 1
                elif cfg.allow_short and px > up:
                    position = -1
            elif position == 1:
                # Long exit: either price has reverted to mean, or (if disabled)
                # tagged the upper band.
                if (cfg.exit_at_mean and px >= m) or (not cfg.exit_at_mean and px > up):
                    position = -1 if cfg.allow_short and px > up else 0
            elif position == -1:
                if (cfg.exit_at_mean and px <= m) or (not cfg.exit_at_mean and px < lo):
                    position = 1 if px < lo else 0

            signal.iloc[i] = position
        return signal
