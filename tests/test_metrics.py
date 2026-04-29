"""Validate metrics formulas against hand-computable cases."""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend.analytics.metrics import (
    TRADING_DAYS_PER_YEAR,
    compute_metrics,
    monthly_returns,
    _annualized_vol,
    _cagr,
    _max_drawdown,
    _sharpe,
    _sortino,
)


def test_cagr_constant_growth():
    # 1.10x per year for 2 years → CAGR = 10%.
    idx = pd.date_range("2020-01-01", periods=3, freq="365D")
    eq = pd.Series([100.0, 110.0, 121.0], index=idx)
    assert abs(_cagr(eq) - 0.10) < 1e-6


def test_cagr_zero_when_short():
    eq = pd.Series([100.0])
    assert _cagr(eq) == 0.0


def test_max_drawdown_known_curve(known_equity_curve):
    max_dd, _dur = _max_drawdown(known_equity_curve)
    # Equity has a single forced -10% drop, then resumes climbing.
    # Max DD is at most -10% from peak (slightly worse if peak was just before).
    assert max_dd <= -0.09


def test_sharpe_zero_for_flat_returns():
    returns = pd.Series([0.0] * 100)
    assert _sharpe(returns, 0.0) == 0.0


def test_sortino_handles_no_downside():
    # All-positive returns → downside std = 0 → Sortino = +∞.
    returns = pd.Series([0.001] * 100)
    assert _sortino(returns, 0.0) == float("inf")


def test_annualized_vol_scales_correctly():
    # Daily std of 1% → annualized = 1% * sqrt(252).
    returns = pd.Series(np.random.default_rng(0).normal(0.0, 0.01, size=10_000))
    annualized = _annualized_vol(returns)
    expected = returns.std(ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR)
    assert abs(annualized - expected) < 1e-9


def test_compute_metrics_returns_zeroes_on_empty():
    eq = pd.Series(dtype=float)
    m = compute_metrics(equity=eq)
    assert m.cagr_pct == 0.0
    assert m.sharpe_ratio == 0.0
    assert m.max_drawdown_pct == 0.0
    assert m.total_trades == 0


def test_compute_metrics_categories(known_equity_curve):
    m = compute_metrics(equity=known_equity_curve)
    rows = m.as_long_rows()
    cats = {cat for _, _, cat in rows}
    assert cats == {"return", "risk", "trade"}


def test_monthly_returns_shape(known_equity_curve):
    table = monthly_returns(known_equity_curve)
    assert table.index.name == "year"
    assert table.columns.name == "month"


def test_profit_factor_computed():
    # 3 winners of $50, 2 losers of $20 → PF = 150 / 40 = 3.75.
    eq = pd.Series([100.0, 110.0, 90.0], index=pd.date_range("2020-01-01", periods=3, freq="D"))
    pnls = pd.Series([50.0, 50.0, 50.0, -20.0, -20.0])
    m = compute_metrics(equity=eq, trade_pnls=pnls)
    assert abs(m.profit_factor - 3.75) < 1e-6
    assert m.total_trades == 5
    assert abs(m.win_rate_pct - 60.0) < 1e-6
