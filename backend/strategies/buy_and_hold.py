"""Buy & Hold — the simplest possible benchmark strategy.

Logic
-----
Be long every bar. The engine then handles the rest: it places a buy order
at bar 0 that fills at bar 1's open, sizes the position via the same risk
manager every other strategy uses, and pays the same commission/slippage.

Why it lives in the strategy registry
-------------------------------------
It's used internally by ``backend.analytics.benchmarks`` to compute the
same-asset and SPY benchmark equity curves shown alongside the strategy on
the equity chart. Registering it here means those benchmarks pay the same
realistic frictions a user would pay if they actually held the asset, with
zero duplicated engine logic. As a side benefit, the strategy is also
selectable from the UI like any other — useful as an explicit baseline run.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd

from backend.strategies.base import BaseStrategy, StrategyConfig


class BuyAndHoldConfig(StrategyConfig):
    """No parameters — buy and hold is parameter-free by construction."""


class BuyAndHoldStrategy(BaseStrategy):
    """Hold a long position from the first fillable bar to the end."""

    slug: ClassVar[str] = "buy-and-hold"
    name: ClassVar[str] = "Buy & Hold"
    category: ClassVar[str] = "Benchmark"
    description: ClassVar[str] = (
        "Reference benchmark that takes a long position at the first "
        "available bar and holds it for the entire run. Used both as a "
        "user-selectable baseline and internally to compute the buy-and-hold "
        "overlays drawn on every backtest's equity chart."
    )
    config_cls: ClassVar[type[StrategyConfig]] = BuyAndHoldConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        signal = pd.Series(1, index=bars.index, dtype=int, name="signal")
        return signal
