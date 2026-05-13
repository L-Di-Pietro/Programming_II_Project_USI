"""Annualization scaling: vol/Sharpe/Sortino must scale by sqrt(N) when
the periods_per_year argument changes — independent of the underlying
returns series.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from backend.analytics.metrics import _annualized_vol, _sharpe, _sortino


def _returns_series(n: int = 5_000, seed: int = 0) -> pd.Series:
    rng = np.random.default_rng(seed)
    return pd.Series(rng.normal(0.0, 0.01, size=n))


def test_annualized_vol_scales_with_periods_per_year():
    r = _returns_series()
    daily = _annualized_vol(r, periods_per_year=252.0)
    hourly_fx = _annualized_vol(r, periods_per_year=6240.0)
    assert abs(hourly_fx / daily - math.sqrt(6240.0 / 252.0)) < 1e-9


def test_sharpe_scales_with_periods_per_year():
    # Inject a positive mean so Sharpe is non-zero and the ratio is stable.
    rng = np.random.default_rng(0)
    r = pd.Series(rng.normal(0.0005, 0.01, size=5_000))
    daily = _sharpe(r, risk_free_rate=0.0, periods_per_year=252.0)
    hourly_eq = _sharpe(r, risk_free_rate=0.0, periods_per_year=1638.0)
    assert abs(hourly_eq / daily - math.sqrt(1638.0 / 252.0)) < 1e-9


def test_sortino_scales_with_periods_per_year():
    rng = np.random.default_rng(1)
    r = pd.Series(rng.normal(0.0005, 0.01, size=5_000))
    daily = _sortino(r, risk_free_rate=0.0, periods_per_year=252.0)
    hourly_crypto = _sortino(r, risk_free_rate=0.0, periods_per_year=8760.0)
    assert abs(hourly_crypto / daily - math.sqrt(8760.0 / 252.0)) < 1e-9


def test_default_periods_preserves_legacy_behavior():
    """compute_metrics with no periods_per_year arg must match periods_per_year=252."""
    from backend.analytics.metrics import compute_metrics

    rng = np.random.default_rng(2)
    equity = pd.Series(
        100.0 * np.cumprod(1.0 + rng.normal(0.0005, 0.01, size=500)),
        index=pd.date_range("2020-01-01", periods=500, freq="B"),
    )
    default = compute_metrics(equity=equity)
    explicit = compute_metrics(equity=equity, periods_per_year=252.0)
    assert default.annualized_volatility_pct == explicit.annualized_volatility_pct
    assert default.sharpe_ratio == explicit.sharpe_ratio
