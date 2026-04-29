"""RiskManager — converts a target signal into a concrete order quantity.

Two sizing modes shipped:

* ``FIXED_FRACTION`` — risk a constant fraction of equity on each new entry.
* ``VOL_TARGET``     — scale position size inversely with realized volatility,
                       so the dollar-risk per position is constant across
                       regimes.

Plus an optional **max-DD circuit breaker**: if equity drops more than
``max_dd_pct`` from peak, force the strategy flat for the rest of the run.
"""

from __future__ import annotations

import math
import sys

if sys.version_info >= (3, 11):
    from enum import StrEnum
else:
    from enum import Enum

    class StrEnum(str, Enum):
        pass

import numpy as np
import pandas as pd

from backend.backtest.portfolio import Portfolio


class SizingMode(StrEnum):
    FIXED_FRACTION = "fixed_fraction"
    VOL_TARGET = "vol_target"


class RiskManager:
    """Computes order quantity from current state + target."""

    def __init__(
        self,
        sizing_mode: SizingMode = SizingMode.FIXED_FRACTION,
        risk_fraction: float = 1.0,
        vol_target_annual: float = 0.20,
        vol_lookback: int = 20,
        max_dd_pct: float | None = None,
        allow_fractional: bool = False,
    ) -> None:
        if not 0.0 < risk_fraction <= 1.0:
            raise ValueError("risk_fraction must be in (0, 1]")
        self.sizing_mode = sizing_mode
        self.risk_fraction = risk_fraction
        self.vol_target_annual = vol_target_annual
        self.vol_lookback = vol_lookback
        self.max_dd_pct = max_dd_pct
        self.allow_fractional = allow_fractional

        self._peak_equity: float = 0.0
        self._halted: bool = False

    # ------------------------------------------------------------------------
    # Public API — called once per bar
    # ------------------------------------------------------------------------
    def size_order(
        self,
        portfolio: Portfolio,
        target_signal: int,
        bars: pd.DataFrame,
        bar_index: int,
    ) -> tuple[int, float]:
        """Compute (side, qty) for the order at this bar, or ``(0, 0)``.

        Parameters
        ----------
        portfolio
            Current portfolio state (post mark-to-market).
        target_signal
            Strategy's desired position at end of this bar (∈ {-1, 0, 1}).
        bars
            Full price history (so we can compute trailing volatility).
        bar_index
            Position of "this bar" in ``bars`` — we never look beyond it.
        """
        # Update circuit-breaker state.
        self._peak_equity = max(self._peak_equity, portfolio.equity)
        if self.max_dd_pct is not None and self._peak_equity > 0:
            current_dd = 1.0 - portfolio.equity / self._peak_equity
            if current_dd >= self.max_dd_pct:
                self._halted = True

        # If halted, force everything flat.
        target = 0 if self._halted else target_signal

        # Compute the desired absolute quantity for the target position.
        target_qty_abs = self._target_qty(portfolio, bars, bar_index)
        if not self.allow_fractional:
            target_qty_abs = float(math.floor(target_qty_abs))

        target_signed = target * target_qty_abs
        delta = target_signed - portfolio.position.qty
        if abs(delta) < 1e-9:
            return 0, 0.0

        side = 1 if delta > 0 else -1
        qty = abs(delta)
        return side, qty

    # ------------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------------
    def _target_qty(self, portfolio: Portfolio, bars: pd.DataFrame, bar_index: int) -> float:
        """Compute the *absolute* qty for a fully-loaded target position."""
        last_close = float(bars["close"].iloc[bar_index])
        if last_close <= 0:
            return 0.0

        if self.sizing_mode == SizingMode.FIXED_FRACTION:
            cash_for_position = portfolio.equity * self.risk_fraction
            return cash_for_position / last_close

        if self.sizing_mode == SizingMode.VOL_TARGET:
            log_returns = np.log(bars["close"].iloc[: bar_index + 1]).diff()
            recent = log_returns.iloc[-self.vol_lookback :]
            realized_daily_vol = float(recent.std())
            if realized_daily_vol <= 0 or math.isnan(realized_daily_vol):
                return 0.0
            # Annualize assuming 252 trading days; scale position so annualized
            # vol of position = vol_target_annual.
            realized_annual_vol = realized_daily_vol * math.sqrt(252)
            scale = self.vol_target_annual / realized_annual_vol
            cash_for_position = portfolio.equity * scale
            # Cap at full equity to prevent leverage > 1 in v1.
            cash_for_position = min(cash_for_position, portfolio.equity)
            return cash_for_position / last_close

        raise ValueError(f"Unknown sizing_mode {self.sizing_mode!r}")  # pragma: no cover
