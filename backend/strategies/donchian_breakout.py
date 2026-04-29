"""Donchian Channel Breakout — Turtle Trading classic.

Logic
-----
Compute the Donchian channel: rolling N-bar high (upper) and rolling M-bar
low (lower). Convention from the Turtles:

* Close above the upper channel (e.g. 20-day high) → enter long.
* Close below the lower channel (e.g. 10-day low)  → exit long.

The asymmetric entry (longer) / exit (shorter) windows keep the strategy in
big trends but exit quickly when momentum stalls.

This is a momentum / breakout strategy — the philosophical opposite of
mean-reversion strategies. Pairs well in a portfolio with mean-reverters.

Citations
---------
Faith, C. (2007). *The Way of the Turtle*.
"""

from __future__ import annotations

from typing import ClassVar

import pandas as pd
from pydantic import Field

from backend.strategies.base import BaseStrategy, StrategyConfig


class DonchianBreakoutConfig(StrategyConfig):
    entry_window: int = Field(
        default=20,
        ge=2,
        le=400,
        description="Bars in the rolling high used for entries.",
    )
    exit_window: int = Field(
        default=10,
        ge=2,
        le=400,
        description="Bars in the rolling low used for exits.",
    )
    allow_short: bool = Field(
        default=False,
        description="If true, mirror the logic on the short side.",
    )


class DonchianBreakoutStrategy(BaseStrategy):
    """Momentum: long on N-bar high break-outs, exit on M-bar low break-downs."""

    slug: ClassVar[str] = "donchian-breakout"
    name: ClassVar[str] = "Donchian Channel Breakout"
    description: ClassVar[str] = (
        "Momentum strategy from the Turtle Traders: enter long when price "
        "breaks above its rolling N-bar high, exit when it breaks below its "
        "rolling M-bar low. Great in trending markets, gives back small "
        "false-breakout losses in ranges."
    )
    config_cls: ClassVar[type[StrategyConfig]] = DonchianBreakoutConfig

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        cfg: DonchianBreakoutConfig = self.config  # type: ignore[assignment]
        if cfg.exit_window > cfg.entry_window:
            # Allowed but unusual — Turtles used 20 in / 10 out. Warn-by-shape.
            pass

        # Use prior-bar values for the channel so a bar's close cannot trigger
        # its own breakout signal — this is part of the look-ahead-bias guard.
        close = bars["close"]
        upper_break = bars["high"].shift(1).rolling(cfg.entry_window).max()
        lower_break = bars["low"].shift(1).rolling(cfg.exit_window).min()

        signal = pd.Series(0, index=bars.index, dtype=int, name="signal")
        position = 0
        for i in range(len(bars)):
            up = upper_break.iloc[i]
            lo = lower_break.iloc[i]
            px = close.iloc[i]
            if pd.isna(up) or pd.isna(lo):
                signal.iloc[i] = 0
                continue

            if position == 0:
                if px > up:
                    position = 1
                elif cfg.allow_short and px < lo:
                    position = -1
            elif position == 1 and px < lo:
                position = 0
            elif position == -1 and px > up:
                position = 0

            signal.iloc[i] = position
        return signal
