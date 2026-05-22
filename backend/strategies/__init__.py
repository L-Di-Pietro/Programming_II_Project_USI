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
from backend.strategies.buy_and_hold import BuyAndHoldStrategy
from backend.strategies.cci import CCIStrategy
from backend.strategies.donchian_breakout import DonchianBreakoutStrategy
from backend.strategies.ichimoku_cloud import IchimokuCloudStrategy
from backend.strategies.keltner_channels import KeltnerChannelsStrategy
from backend.strategies.macd_crossover import MACDCrossoverStrategy
from backend.strategies.rsi_mean_reversion import RSIMeanReversionStrategy
from backend.strategies.sma_crossover import SMACrossoverStrategy
from backend.strategies.stochastic_oscillator import StochasticOscillatorStrategy
from backend.strategies.time_series_momentum import TimeSeriesMomentumStrategy

# Keep order = display order in the UI.
STRATEGY_REGISTRY: dict[str, type[BaseStrategy]] = {
    SMACrossoverStrategy.slug: SMACrossoverStrategy,
    MACDCrossoverStrategy.slug: MACDCrossoverStrategy,
    IchimokuCloudStrategy.slug: IchimokuCloudStrategy,
    DonchianBreakoutStrategy.slug: DonchianBreakoutStrategy,
    KeltnerChannelsStrategy.slug: KeltnerChannelsStrategy,
    TimeSeriesMomentumStrategy.slug: TimeSeriesMomentumStrategy,
    RSIMeanReversionStrategy.slug: RSIMeanReversionStrategy,
    BollingerBandsStrategy.slug: BollingerBandsStrategy,
    StochasticOscillatorStrategy.slug: StochasticOscillatorStrategy,
    CCIStrategy.slug: CCIStrategy,
    BuyAndHoldStrategy.slug: BuyAndHoldStrategy,
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
    "BuyAndHoldStrategy",
    "CCIStrategy",
    "DonchianBreakoutStrategy",
    "IchimokuCloudStrategy",
    "KeltnerChannelsStrategy",
    "MACDCrossoverStrategy",
    "RSIMeanReversionStrategy",
    "STRATEGY_REGISTRY",
    "SMACrossoverStrategy",
    "StochasticOscillatorStrategy",
    "StrategyConfig",
    "TimeSeriesMomentumStrategy",
    "get_strategy",
]
