"""Strategy package — registers every shipped strategy.

Adding a new strategy
---------------------
1. Implement a class in this folder that subclasses ``BaseStrategy``.
2. Import it below and add it to ``STRATEGY_REGISTRY``.
3. The DB row in ``strategies`` is created automatically by ``init_db.py``.

The registry is keyed by **slug** (lowercase, hyphenated identifier) which is
also the public identifier exposed by the API.
"""

from __future__ import annotations

from backend.strategies.base import BaseStrategy, StrategyConfig
from backend.strategies.bollinger_bands import BollingerBandsStrategy
from backend.strategies.donchian_breakout import DonchianBreakoutStrategy
from backend.strategies.rsi_mean_reversion import RSIMeanReversionStrategy
from backend.strategies.sma_crossover import SMACrossoverStrategy

# Keep order = display order in the UI.
STRATEGY_REGISTRY: dict[str, type[BaseStrategy]] = {
    SMACrossoverStrategy.slug: SMACrossoverStrategy,
    RSIMeanReversionStrategy.slug: RSIMeanReversionStrategy,
    BollingerBandsStrategy.slug: BollingerBandsStrategy,
    DonchianBreakoutStrategy.slug: DonchianBreakoutStrategy,
}


def get_strategy(slug: str) -> type[BaseStrategy]:
    """Look up a strategy class by slug. Raises ``KeyError`` if unknown."""
    try:
        return STRATEGY_REGISTRY[slug]
    except KeyError as e:
        raise KeyError(
            f"Unknown strategy {slug!r}. Available: {sorted(STRATEGY_REGISTRY)}"
        ) from e


__all__ = [
    "BaseStrategy",
    "BollingerBandsStrategy",
    "DonchianBreakoutStrategy",
    "RSIMeanReversionStrategy",
    "STRATEGY_REGISTRY",
    "SMACrossoverStrategy",
    "StrategyConfig",
    "get_strategy",
]
