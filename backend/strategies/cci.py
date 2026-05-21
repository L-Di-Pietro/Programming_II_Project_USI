"""Commodity Channel Index — Lambert's deviation-from-mean oscillator.

Logic
-----
* TP   = (high + low + close) / 3                            # "typical price"
* SMA  = SMA(TP, ``period``)
* MD   = mean absolute deviation of TP from SMA over the same window
* CCI  = (TP − SMA) / (``constant`` * MD)

Mean-reversion interpretation:
  * CCI < ``buy_threshold``  → oversold reversal → target long
  * CCI > ``sell_threshold`` → overbought reversal → target -1 (if ``allow_short``) else 0
  * Otherwise → hold the previous target.

Citations
---------
Lambert, D. R. (1980). "Commodity Channel Index: Tool for Trading Cyclic Trends."
*Commodities Magazine*, October 1980.
"""

from __future__ import annotations

from typing import ClassVar

import numpy as np
import pandas as pd
from pydantic import Field, model_validator

from backend.strategies.base import BaseStrategy, StrategyConfig


class CCIConfig(StrategyConfig):
    period: int = Field(
        default=20,
        ge=2,
        le=400,
        description="Lookback for SMA and mean absolute deviation.",
    )
    buy_threshold: float = Field(
        default=-100.0,
        le=0.0,
        description="CCI level at or below which to target long.",
    )
    sell_threshold: float = Field(
        default=100.0,
        ge=0.0,
        description="CCI level at or above which to target short.",
    )
    constant: float = Field(
        default=0.015,
        gt=0.0,
        le=1.0,
        description="Lambert's scaling constant in the CCI denominator.",
    )
    allow_short: bool = Field(
        default=True, description="If true, short on overbought CCI."
    )

    @model_validator(mode="after")
    def _check_thresholds(self) -> CCIConfig:
        if self.buy_threshold >= self.sell_threshold:
            raise ValueError("buy_threshold must be strictly less than sell_threshold")
        return self


class CCIStrategy(BaseStrategy):
    """Mean-reversion using Lambert's Commodity Channel Index."""

    slug: ClassVar[str] = "cci"
    name: ClassVar[str] = "Commodity Channel Index"
    category: ClassVar[str] = "Mean Reversion"
    description: ClassVar[str] = (
        "Buys when the CCI drops below an oversold threshold and (optionally) "
        "sells when it rises above an overbought threshold. Measures how far "
        "the typical price is from its rolling mean in units of mean absolute "
        "deviation, making the signal scale-invariant across assets."
    )
    config_cls: ClassVar[type[StrategyConfig]] = CCIConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: CCIConfig = self.config  # type: ignore[assignment]
        tp = (bars["high"] + bars["low"] + bars["close"]) / 3.0
        sma = tp.rolling(window=cfg.period, min_periods=cfg.period).mean()
        mean_dev = (
            tp.rolling(window=cfg.period, min_periods=cfg.period)
            .apply(lambda s: float(np.mean(np.abs(s - s.mean()))), raw=True)
        )
        cci = (tp - sma) / (cfg.constant * mean_dev.replace(0.0, np.nan))

        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        position = 0
        cci_arr = cci.to_numpy()
        for i in range(len(bars)):
            v = cci_arr[i]
            if pd.isna(v):
                signal.iloc[i] = 0
                continue
            if v < cfg.buy_threshold:
                position = 1
            elif v > cfg.sell_threshold:
                position = -1 if cfg.allow_short else 0
            signal.iloc[i] = position
        return signal
