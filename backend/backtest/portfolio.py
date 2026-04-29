"""Portfolio — tracks cash, position, and equity over a backtest run.

Single-asset for v1 (one ``Position`` per portfolio). Multi-asset would
generalise this to a dict[asset_id → Position].
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class Position:
    """A single open position. ``qty`` is signed: positive = long, negative
    = short, zero = flat."""
    qty: float = 0.0
    avg_price: float = 0.0  # weighted-average entry price (post-slippage)

    @property
    def is_flat(self) -> bool:
        return self.qty == 0.0

    @property
    def is_long(self) -> bool:
        return self.qty > 0.0

    @property
    def is_short(self) -> bool:
        return self.qty < 0.0


@dataclass(slots=True)
class Portfolio:
    """Cash + position tracker. Marked-to-market each bar."""

    cash: float
    initial_cash: float
    position: Position = field(default_factory=Position)

    # Mark-to-market value of the position at the most recent bar.
    position_value: float = 0.0

    def __init__(self, initial_cash: float) -> None:
        self.cash = initial_cash
        self.initial_cash = initial_cash
        self.position = Position()
        self.position_value = 0.0

    # ------------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------------
    @property
    def equity(self) -> float:
        """Total equity = cash + mark-to-market position value."""
        return self.cash + self.position_value

    def mark_to_market(self, last_price: float) -> None:
        """Update ``position_value`` based on the most recent bar's close."""
        self.position_value = self.position.qty * last_price

    def apply_fill(
        self,
        side: int,           # +1 for buy, -1 for sell
        qty: float,          # always positive
        fill_price: float,
        commission: float,
    ) -> tuple[float, float]:
        """Mutate the portfolio to reflect a fill.

        Returns
        -------
        (gross_pnl, net_pnl) realised on this trade leg. Both are 0.0 for
        opening trades; for closing trades they reflect the difference between
        entry and exit prices, less commissions.
        """
        signed_qty = side * qty
        # Cash impact: buying spends cash, selling adds cash. Commission is
        # always paid (subtracted from cash).
        cash_change = -side * qty * fill_price - commission
        self.cash += cash_change

        gross_pnl = 0.0
        if self.position.is_flat:
            # Opening a new position.
            self.position.qty = signed_qty
            self.position.avg_price = fill_price
        elif (self.position.is_long and side == 1) or (self.position.is_short and side == -1):
            # Adding to existing position — update weighted-average entry price.
            new_qty = self.position.qty + signed_qty
            self.position.avg_price = (
                self.position.qty * self.position.avg_price + signed_qty * fill_price
            ) / new_qty
            self.position.qty = new_qty
        else:
            # Reducing or flipping the position. Realise PnL on the closed
            # portion at the avg_price-vs-fill_price spread.
            closing_qty = min(qty, abs(self.position.qty))
            gross_pnl = (
                (fill_price - self.position.avg_price)
                * closing_qty
                * (1 if self.position.is_long else -1)
            )
            new_signed = self.position.qty + signed_qty
            if abs(new_signed) < 1e-9:
                # Fully closed.
                self.position.qty = 0.0
                self.position.avg_price = 0.0
            elif (self.position.is_long and new_signed < 0) or (
                self.position.is_short and new_signed > 0
            ):
                # Flipped — open the residual at the fill price.
                self.position.qty = new_signed
                self.position.avg_price = fill_price
            else:
                # Partial close — keep avg_price unchanged.
                self.position.qty = new_signed

        net_pnl = gross_pnl - commission
        return gross_pnl, net_pnl
