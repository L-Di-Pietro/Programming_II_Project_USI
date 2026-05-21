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
from backend.strategies.cci import CCIStrategy
from backend.strategies.donchian_breakout import DonchianBreakoutStrategy
from backend.strategies.ichimoku_cloud import IchimokuCloudStrategy
from backend.strategies.keltner_channels import KeltnerChannelsStrategy
from backend.strategies.macd_crossover import MACDCrossoverStrategy
from backend.strategies.rsi_mean_reversion import RSIMeanReversionStrategy
from backend.strategies.sma_crossover import SMACrossoverStrategy
from backend.strategies.stochastic_oscillator import StochasticOscillatorStrategy
from backend.strategies.time_series_momentum import TimeSeriesMomentumStrategy


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


# ---------------------------------------------------------------------------
# Behavioural tests for the 6 new strategies
# ---------------------------------------------------------------------------


def _ohlcv_from_close(close: np.ndarray, *, spread: float = 0.5) -> pd.DataFrame:
    """Helper: build a minimal OHLCV frame around a close series."""
    return pd.DataFrame(
        {
            "open": close,
            "high": close + spread,
            "low": close - spread,
            "close": close,
            "volume": np.full_like(close, 1000.0),
        },
        index=pd.date_range("2020-01-01", periods=len(close), freq="B"),
    )


def test_macd_goes_long_after_regime_shift() -> None:
    # MACD is a momentum-acceleration detector — in a linear trend it whipsaws
    # near steady state. Build a clear regime shift (flat → strong uptrend)
    # and assert that MACD enters a long state once the ramp starts.
    flat = np.full(50, 100.0)
    ramp = np.linspace(100.0, 200.0, 200)
    bars = _ohlcv_from_close(np.concatenate([flat, ramp]))
    strat = MACDCrossoverStrategy(
        MACDCrossoverStrategy.config_cls(
            fast_period=5, slow_period=15, signal_period=5
        )
    )
    signals = strat.generate_signals(bars)
    assert (signals.iloc[60:] == 1).any()


def test_macd_validates_periods() -> None:
    cfg = MACDCrossoverStrategy.config_cls(fast_period=26, slow_period=12)
    strat = MACDCrossoverStrategy(cfg)
    bars = _ohlcv_from_close(np.linspace(100, 110, 50))
    with pytest.raises(ValueError):
        strat.generate_signals(bars)


def test_tsm_goes_long_on_uptrend(trending_bars: pd.DataFrame) -> None:
    strat = TimeSeriesMomentumStrategy(
        TimeSeriesMomentumStrategy.config_cls(lookback_bars=50, allow_short=True)
    )
    signals = strat.generate_signals(trending_bars)
    # After warm-up every trailing 50-bar return is positive.
    assert (signals.iloc[100:] == 1).all()


def test_tsm_clamps_short_when_disallowed() -> None:
    falling = _ohlcv_from_close(np.linspace(200.0, 100.0, 120))
    strat = TimeSeriesMomentumStrategy(
        TimeSeriesMomentumStrategy.config_cls(lookback_bars=20, allow_short=False)
    )
    signals = strat.generate_signals(falling)
    # Returns are negative → without shorting, signal must stay in {0, 1} only.
    assert set(signals.unique()).issubset({0, 1})


def test_ichimoku_goes_long_above_cloud(trending_bars: pd.DataFrame) -> None:
    strat = IchimokuCloudStrategy()
    signals = strat.generate_signals(trending_bars)
    # Steady uptrend → price is above the cloud and Tenkan > Kijun for many bars.
    assert (signals.iloc[200:] == 1).sum() > 0


def test_keltner_breakout_enters_long_above_upper(trending_bars: pd.DataFrame) -> None:
    strat = KeltnerChannelsStrategy()
    signals = strat.generate_signals(trending_bars)
    assert (signals == 1).sum() > 0


def test_keltner_mean_reversion_differs_from_breakout(trending_bars: pd.DataFrame) -> None:
    breakout = KeltnerChannelsStrategy(
        KeltnerChannelsStrategy.config_cls(mode="breakout")
    ).generate_signals(trending_bars)
    meanrev = KeltnerChannelsStrategy(
        KeltnerChannelsStrategy.config_cls(mode="mean_reversion")
    ).generate_signals(trending_bars)
    assert not breakout.equals(meanrev)


def test_stochastic_long_on_cross_up_through_oversold() -> None:
    # V-shape: deep drop, then sharp recovery → %K crosses up through 20.
    drop = np.linspace(100.0, 50.0, 40)
    rebound = np.linspace(50.0, 110.0, 40)
    bars = _ohlcv_from_close(np.concatenate([drop, rebound]))
    strat = StochasticOscillatorStrategy()
    signals = strat.generate_signals(bars)
    assert (signals == 1).sum() > 0


def test_stochastic_validates_bands() -> None:
    with pytest.raises(ValueError):
        StochasticOscillatorStrategy.config_cls(oversold=70.0, overbought=30.0)


def test_cci_long_on_oversold_dip(trending_bars: pd.DataFrame) -> None:
    dip = trending_bars.copy()
    # Force a sharp dip across a window so CCI drops well below -100.
    dip.iloc[30:40] = dip.iloc[30:40] * 0.7
    strat = CCIStrategy()
    signals = strat.generate_signals(dip)
    assert (signals == 1).sum() > 0


def test_cci_validates_thresholds() -> None:
    with pytest.raises(ValueError):
        CCIStrategy.config_cls(buy_threshold=100.0, sell_threshold=-100.0)
