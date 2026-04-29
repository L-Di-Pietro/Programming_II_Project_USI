"""ExecutionHandler — applies slippage and commissions to a target order.

The engine queues an order at bar ``t`` and asks the execution handler to
"fill" it at bar ``t+1``'s open. The execution handler:

1. Adjusts the open price by the configured slippage (always against the
   trader — buys fill higher, sells fill lower).
2. Computes the commission cost.
3. Returns a ``FillResult`` the engine uses to update the portfolio and
   record a ``Trade`` row.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class FillResult:
    side: int            # +1 buy, -1 sell
    qty: float           # always positive
    fill_price: float    # post-slippage
    slippage_cost: float # qty * |fill_price - reference_price|
    commission: float    # qty * fill_price * bps / 10_000


class ExecutionHandler:
    """Stateless — same params produce same fills given same inputs."""

    def __init__(self, slippage_bps: float, commission_bps: float) -> None:
        self.slippage_bps = slippage_bps
        self.commission_bps = commission_bps

    def fill(self, side: int, qty: float, reference_price: float) -> FillResult:
        """Apply slippage and commissions.

        Parameters
        ----------
        side
            +1 for buy, -1 for sell.
        qty
            Strictly positive order size (in shares / units / lots).
        reference_price
            The "fair" fill price — typically the next bar's open.
        """
        if qty <= 0:
            raise ValueError(f"qty must be > 0, got {qty}")
        if side not in (-1, 1):
            raise ValueError(f"side must be ±1, got {side}")

        # Slippage: buys fill at price * (1 + slip), sells at price * (1 - slip).
        slip_factor = side * self.slippage_bps / 10_000.0
        fill_price = reference_price * (1.0 + slip_factor)
        slippage_cost = abs(fill_price - reference_price) * qty

        # Commission as bps of notional, applied on every leg.
        commission = qty * fill_price * (self.commission_bps / 10_000.0)

        return FillResult(
            side=side,
            qty=qty,
            fill_price=fill_price,
            slippage_cost=slippage_cost,
            commission=commission,
        )
