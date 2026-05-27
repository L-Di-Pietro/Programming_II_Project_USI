"""Tests for the benchmark sub-resource endpoints.

The route handlers are exercised directly (like ``test_report_route.py``) — the
handlers ARE the logic; FastAPI only routes to them. A real run with persisted
benchmark equity is produced by running ``BacktestAgent`` on a synthetic asset,
reusing the seeding helpers from ``test_benchmarks``.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.api.routes.backtest import get_benchmark_equity, get_benchmark_metrics
from backend.database.models import Asset, AssetClass
from tests.test_benchmarks import (
    _run_agent_and_collect,
    _seed_bars,
    _seed_strategy_rows,
)


def _seed_run_with_benchmarks(db, *, with_spy: bool = False) -> int:
    """Seed AAPL (+ optionally SPY) bars and run a buy-and-hold backtest.

    The agent always persists the same-asset (buy_and_hold) benchmark, and the
    SPY benchmark only when SPY OHLCV exists — which lets us test the
    'unavailable' path by leaving SPY out.
    """
    _seed_strategy_rows(db)
    aapl = Asset(symbol="AAPL", asset_class=AssetClass.EQUITY, name="Apple", exchange="NASDAQ")
    db.add(aapl)
    if with_spy:
        db.add(Asset(symbol="SPY", asset_class=AssetClass.ETF, name="SPDR S&P 500", exchange="NYSE"))
    db.commit()
    db.refresh(aapl)
    _seed_bars(db, aapl.id, close=180.0)
    if with_spy:
        spy = db.query(Asset).filter_by(symbol="SPY").one()
        _seed_bars(db, spy.id, close=450.0)
    return _run_agent_and_collect(db, "AAPL")


def test_benchmark_equity_buy_and_hold_returns_points(db) -> None:
    run_id = _seed_run_with_benchmarks(db)
    points = get_benchmark_equity(run_id=run_id, kind="buy_and_hold", db=db)
    assert points, "expected a non-empty buy-and-hold equity curve"
    assert all(p.equity > 0 for p in points)
    timestamps = [p.ts for p in points]
    assert timestamps == sorted(timestamps)


def test_benchmark_metrics_buy_and_hold_shape(db) -> None:
    run_id = _seed_run_with_benchmarks(db)
    metrics = get_benchmark_metrics(run_id=run_id, kind="buy_and_hold", db=db)
    # Return + risk are computed from the benchmark equity curve.
    assert "cagr_pct" in metrics.return_metrics
    assert "sharpe_ratio" in metrics.risk
    # A buy-and-hold benchmark doesn't trade -> the trade block is zeroed.
    assert all(value == 0 for value in metrics.trade.values())


def test_benchmark_sp500_unavailable_returns_404(db) -> None:
    """No SPY data seeded -> the SPY benchmark was never persisted -> 404."""
    run_id = _seed_run_with_benchmarks(db, with_spy=False)
    with pytest.raises(HTTPException) as equity_exc:
        get_benchmark_equity(run_id=run_id, kind="sp500", db=db)
    assert equity_exc.value.status_code == 404
    with pytest.raises(HTTPException) as metrics_exc:
        get_benchmark_metrics(run_id=run_id, kind="sp500", db=db)
    assert metrics_exc.value.status_code == 404


def test_benchmark_404_when_run_missing(db) -> None:
    with pytest.raises(HTTPException) as exc:
        get_benchmark_equity(run_id=9999, kind="buy_and_hold", db=db)
    assert exc.value.status_code == 404
