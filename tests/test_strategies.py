"""Strategy-level unit tests.

Each strategy gets a "shape" test (output is a Series of int in {-1, 0, 1}
aligned to the input index) and a "behavioural" test (generates the right
signal on a contrived fixture).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from backend.strategies import STRATEGY_REGISTRY, get_strategy
from backend.strategies.bollinger_bands import BollingerBandsStrategy
from backend.strategies.donchian_breakout import DonchianBreakoutStrategy
from backend.strategies.rsi_mean_reversion import RSIMeanReversionStrategy
from backend.strategies.sma_crossover import SMACrossoverStrategy


@pytest.mark.parametrize("slug", list(STRATEGY_REGISTRY.keys()))
def test_strategy_signal_shape(slug, trending_bars):
    cls = get_strategy(slug)
    strat = cls(cls.config_cls())  # default params
    signals = strat.generate_signals(trending_bars)

    assert len(signals) == len(trending_bars)
    assert signals.index.equals(trending_bars.index)
    assert signals.dtype.kind in {"i", "u"}
    assert set(signals.unique()).issubset({-1, 0, 1})


def test_sma_crossover_goes_long_in_uptrend(trending_bars):
    strat = SMACrossoverStrategy(SMACrossoverStrategy.config_cls(fast_window=5, slow_window=20))
    signals = strat.generate_signals(trending_bars)
    # In a strong uptrend the strategy should be long most of the time after
    # the warmup period.
    long_share = (signals.iloc[100:] == 1).mean()
    assert long_share > 0.7


def test_sma_crossover_validates_windows():
    cfg = SMACrossoverStrategy.config_cls(fast_window=20, slow_window=10)
    strat = SMACrossoverStrategy(cfg)
    # generate_signals raises because slow ≤ fast.
    bars = pd.DataFrame(
        {"open": [1.0] * 30, "high": [1.0] * 30, "low": [1.0] * 30, "close": [1.0] * 30, "volume": [0.0] * 30},
        index=pd.date_range("2020-01-01", periods=30, freq="B"),
    )
    with pytest.raises(ValueError):
        strat.generate_signals(bars)


def test_rsi_mean_reversion_buys_oversold():
    # Construct a series where price crashes 20% then mean-reverts.
    n = 100
    close = np.concatenate([np.linspace(100.0, 100.0, 50), np.linspace(80.0, 110.0, 50)])
    bars = pd.DataFrame(
        {"open": close, "high": close * 1.001, "low": close * 0.999, "close": close, "volume": [1000.0] * n},
        index=pd.date_range("2020-01-01", periods=n, freq="B"),
    )
    strat = RSIMeanReversionStrategy(RSIMeanReversionStrategy.config_cls(rsi_window=14))
    signals = strat.generate_signals(bars)
    # Should have *entered* long at some point during the recovery phase.
    assert (signals.iloc[55:] == 1).any()


def test_bollinger_strategy_runs_and_obeys_contract(trending_bars):
    strat = BollingerBandsStrategy(BollingerBandsStrategy.config_cls(window=20, num_std=2.0))
    signals = strat.generate_signals(trending_bars)
    assert len(signals) == len(trending_bars)


def test_donchian_breakout_triggers_on_new_high():
    n = 100
    # Flat 50 bars then a stair-step up — should trigger long entries.
    close = np.concatenate([np.full(50, 100.0), np.linspace(100.0, 130.0, 50)])
    bars = pd.DataFrame(
        {
            "open": close,
            "high": close + 0.1,
            "low": close - 0.1,
            "close": close,
            "volume": [1000.0] * n,
        },
        index=pd.date_range("2020-01-01", periods=n, freq="B"),
    )
    strat = DonchianBreakoutStrategy(
        DonchianBreakoutStrategy.config_cls(entry_window=20, exit_window=10)
    )
    signals = strat.generate_signals(bars)
    assert (signals.iloc[60:] == 1).any()


def test_strategy_registry_unique_slugs():
    slugs = [cls.slug for cls in STRATEGY_REGISTRY.values()]
    assert len(slugs) == len(set(slugs)), "Duplicate strategy slug in registry"
