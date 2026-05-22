"""Tests for the benchmark-overlay pipeline.

Covers:
* The ``BuyAndHoldStrategy`` always emits ``1``.
* ``compute_same_asset_buyhold`` produces the same equity series as the
  engine when run directly with ``BuyAndHoldStrategy``.
* ``compute_spy_buyhold`` carries SPY values across closed-market sessions
  via forward fill.
* B&H respects the engine's no-look-ahead rule (first non-cash equity at
  bar 1, not bar 0).
* The BacktestAgent orchestration:
    - persists the same-asset benchmark every run,
    - skips the SPY benchmark when SPY data is missing,
    - skips the SPY benchmark when the strategy *is* SPY (no duplicate).
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from backend.agents.backtest_agent import BacktestAgent, BacktestAgentInput
from backend.analytics.benchmarks import (
    compute_same_asset_buyhold,
    compute_spy_buyhold,
)
from backend.backtest.engine import BacktestConfig, run_backtest
from backend.database.models import (
    Asset,
    AssetClass,
    BacktestRun,
    BenchmarkEquityPoint,
    BenchmarkKind,
    OHLCVBar,
    Strategy,
    Timeframe,
)
from backend.strategies import STRATEGY_REGISTRY
from backend.strategies.buy_and_hold import BuyAndHoldConfig, BuyAndHoldStrategy


# -----------------------------------------------------------------------------
# Pseudo-strategy basics
# -----------------------------------------------------------------------------
def test_buy_and_hold_signals_all_ones(trending_bars: pd.DataFrame) -> None:
    strat = BuyAndHoldStrategy()
    signals = strat.generate_signals(trending_bars)
    assert len(signals) == len(trending_bars)
    assert (signals == 1).all()
    assert signals.dtype.kind in {"i", "u"}


def test_buy_and_hold_is_registered() -> None:
    assert "buy-and-hold" in STRATEGY_REGISTRY
    assert STRATEGY_REGISTRY["buy-and-hold"] is BuyAndHoldStrategy


def test_buy_and_hold_config_takes_no_params() -> None:
    cfg = BuyAndHoldConfig()
    # The pseudo-strategy is parameter-free — model_dump must be empty.
    assert cfg.model_dump() == {}


# -----------------------------------------------------------------------------
# compute_same_asset_buyhold
# -----------------------------------------------------------------------------
def test_same_asset_buyhold_matches_direct_engine_run(
    trending_bars: pd.DataFrame,
) -> None:
    """Going through the helper must produce the same equity curve as
    invoking the engine directly with a BuyAndHoldStrategy."""
    template = BacktestConfig(
        bars=trending_bars,
        strategy=BuyAndHoldStrategy(),
        initial_cash=10_000.0,
        commission_bps=5.0,
        slippage_bps=2.0,
        allow_fractional=True,
    )
    direct = run_backtest(template)
    direct_equity = pd.Series(
        [e.equity for e in direct.equity_curve],
        index=pd.DatetimeIndex([e.ts for e in direct.equity_curve]),
    )

    helper_equity = compute_same_asset_buyhold(trending_bars, template)

    assert helper_equity.name == "asset_buyhold"
    assert helper_equity.index.equals(direct_equity.index)
    np.testing.assert_allclose(helper_equity.values, direct_equity.values, rtol=1e-12)


def test_same_asset_buyhold_handles_empty_bars() -> None:
    template = BacktestConfig(
        bars=pd.DataFrame(columns=["open", "high", "low", "close", "volume"]),
        strategy=BuyAndHoldStrategy(),
    )
    series = compute_same_asset_buyhold(template.bars, template)
    assert series.empty
    assert series.name == "asset_buyhold"


# -----------------------------------------------------------------------------
# compute_spy_buyhold
# -----------------------------------------------------------------------------
def _constant_bars(close: float, index: pd.DatetimeIndex) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open": np.full(len(index), close, dtype=float),
            "high": np.full(len(index), close, dtype=float),
            "low": np.full(len(index), close, dtype=float),
            "close": np.full(len(index), close, dtype=float),
            "volume": np.full(len(index), 1_000.0),
        },
        index=index,
    )


def test_spy_buyhold_ffill_on_weekend() -> None:
    """Crypto-style 24x7 strategy with NYSE-only SPY: weekend SPY equity
    must equal Friday's, not move."""
    # 14 calendar days starting on a Monday.
    crypto_index = pd.date_range("2024-01-01", periods=14, freq="D")  # Mon → Sun → Sat
    # SPY only has bars on weekdays (B = business day).
    spy_index = pd.date_range("2024-01-01", periods=14, freq="B")  # 14 NYSE sessions

    crypto_bars = _constant_bars(50_000.0, crypto_index)

    # SPY price strictly increases — makes the ffill check easy to read.
    spy_close = np.linspace(450.0, 470.0, len(spy_index))
    spy_bars = pd.DataFrame(
        {
            "open": spy_close,
            "high": spy_close,
            "low": spy_close,
            "close": spy_close,
            "volume": np.full(len(spy_close), 1_000.0),
        },
        index=spy_index,
    )

    template = BacktestConfig(
        bars=crypto_bars,
        strategy=BuyAndHoldStrategy(),
        initial_cash=10_000.0,
        commission_bps=0.0,
        slippage_bps=0.0,
        allow_fractional=True,
    )
    spy_curve = compute_spy_buyhold(crypto_bars, spy_bars, template)

    # The SPY benchmark must be indexed on the crypto calendar (every day).
    assert spy_curve.index.equals(crypto_index)

    # Saturday (2024-01-06) and Sunday (2024-01-07): equity must equal
    # Friday's equity (no SPY moves on closed sessions).
    friday = pd.Timestamp("2024-01-05")
    saturday = pd.Timestamp("2024-01-06")
    sunday = pd.Timestamp("2024-01-07")
    monday = pd.Timestamp("2024-01-08")
    assert spy_curve.loc[saturday] == spy_curve.loc[friday]
    assert spy_curve.loc[sunday] == spy_curve.loc[friday]
    # Monday is a fresh SPY session — equity may now move.
    assert spy_curve.loc[monday] >= spy_curve.loc[sunday]


def test_spy_buyhold_empty_when_no_overlap() -> None:
    strategy_index = pd.date_range("2024-01-01", periods=5, freq="D")
    spy_index = pd.date_range("2030-01-01", periods=5, freq="B")
    strat_bars = _constant_bars(100.0, strategy_index)
    spy_bars = _constant_bars(400.0, spy_index)

    template = BacktestConfig(bars=strat_bars, strategy=BuyAndHoldStrategy())
    series = compute_spy_buyhold(strat_bars, spy_bars, template)
    assert series.empty
    assert series.name == "spy_buyhold"


# -----------------------------------------------------------------------------
# No-look-ahead invariant under BuyAndHold
# -----------------------------------------------------------------------------
def test_buyhold_no_lookahead(trending_bars: pd.DataFrame) -> None:
    """B&H must obey the t→t+1 fill rule like every other strategy: bar 0
    is still pure cash; the long position is established at bar 1's open."""
    cfg = BacktestConfig(
        bars=trending_bars,
        strategy=BuyAndHoldStrategy(),
        initial_cash=10_000.0,
        commission_bps=0.0,
        slippage_bps=0.0,
        allow_fractional=True,
    )
    result = run_backtest(cfg)
    # First equity point reflects pre-trade state: all cash, no position.
    first = result.equity_curve[0]
    assert first.position_value == 0.0
    assert first.cash == 10_000.0
    # The very first trade fills at bar index 1, not bar 0.
    assert result.trades, "expected at least one buy fill"
    assert result.trades[0].ts == trending_bars.index[1].to_pydatetime()


# -----------------------------------------------------------------------------
# BacktestAgent orchestration
#
# The orchestration tests below hit the DB-backed code path. The project's
# ORM models still use ``default=datetime.utcnow`` which Python 3.13 flags as
# a DeprecationWarning — pytest's ``filterwarnings = ["error"]`` then promotes
# it to an exception. That issue is project-wide (test_llm.py / test_report_
# route.py have the same failure) and unrelated to the benchmark feature, so
# we locally suppress it here.
# -----------------------------------------------------------------------------
pytestmark_orchestration = pytest.mark.filterwarnings(
    "ignore:datetime.datetime.utcnow.*:DeprecationWarning"
)


def _seed_strategy_rows(db) -> None:
    """Register every code-level strategy in the DB so the agent can look
    up its FK row. Mirrors what scripts/init_db.py does."""
    for cls in STRATEGY_REGISTRY.values():
        db.add(
            Strategy(
                slug=cls.slug,
                name=cls.name,
                description=cls.description,
                params_schema=cls.params_schema(),
                created_at=datetime.utcnow(),
            )
        )
    db.commit()


def _seed_bars(
    db, asset_id: int, *, close: float, n: int = 60, start: str = "2024-01-01"
) -> None:
    index = pd.date_range(start, periods=n, freq="B")
    closes = np.linspace(close, close * 1.2, n)
    for ts, px in zip(index, closes):
        db.add(
            OHLCVBar(
                asset_id=asset_id,
                ts=ts.to_pydatetime(),
                timeframe=Timeframe.DAILY,
                open=float(px),
                high=float(px),
                low=float(px),
                close=float(px),
                volume=1_000.0,
                source="synthetic",
            )
        )
    db.commit()


def _run_agent_and_collect(db, asset_symbol: str) -> int:
    """Run a tiny BuyAndHold backtest on a synthetic asset, return run_id."""
    asset = db.query(Asset).filter_by(symbol=asset_symbol).one()
    payload = BacktestAgentInput(
        asset_id=asset.id,
        strategy_slug="buy-and-hold",
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 12, 31),
        params={},
        initial_cash=10_000.0,
        commission_bps=0.0,
        slippage_bps=0.0,
        timeframe=Timeframe.DAILY,
    )
    agent = BacktestAgent(db)
    out = agent.run(payload)
    return out.run_id


@pytestmark_orchestration
def test_backtest_agent_persists_asset_benchmark_when_spy_missing(db) -> None:
    """If SPY isn't in the DB, run still completes; only asset_buyhold is
    persisted; a warning is emitted (not asserted, but no exception)."""
    _seed_strategy_rows(db)

    # Strategy asset only — no SPY exists.
    aapl = Asset(symbol="AAPL", asset_class=AssetClass.EQUITY, name="Apple", exchange="NASDAQ")
    db.add(aapl)
    db.commit()
    db.refresh(aapl)
    _seed_bars(db, aapl.id, close=180.0)

    run_id = _run_agent_and_collect(db, "AAPL")

    rows = db.query(BenchmarkEquityPoint).filter_by(run_id=run_id).all()
    kinds = {r.kind for r in rows}
    assert kinds == {str(BenchmarkKind.ASSET_BUYHOLD)}
    assert all(r.equity > 0 for r in rows)


@pytestmark_orchestration
def test_backtest_agent_persists_both_benchmarks_when_spy_present(db) -> None:
    _seed_strategy_rows(db)

    aapl = Asset(symbol="AAPL", asset_class=AssetClass.EQUITY, name="Apple", exchange="NASDAQ")
    spy = Asset(symbol="SPY", asset_class=AssetClass.ETF, name="SPDR S&P 500", exchange="NYSE")
    db.add_all([aapl, spy])
    db.commit()
    db.refresh(aapl)
    db.refresh(spy)
    _seed_bars(db, aapl.id, close=180.0)
    _seed_bars(db, spy.id, close=450.0)

    run_id = _run_agent_and_collect(db, "AAPL")

    rows = db.query(BenchmarkEquityPoint).filter_by(run_id=run_id).all()
    kinds = {r.kind for r in rows}
    assert kinds == {str(BenchmarkKind.ASSET_BUYHOLD), str(BenchmarkKind.SPY_BUYHOLD)}


@pytestmark_orchestration
def test_backtest_agent_skips_spy_when_strategy_is_spy(db) -> None:
    """SPY benchmark would duplicate the same-asset benchmark — skip it."""
    _seed_strategy_rows(db)

    spy = Asset(symbol="SPY", asset_class=AssetClass.ETF, name="SPDR S&P 500", exchange="NYSE")
    db.add(spy)
    db.commit()
    db.refresh(spy)
    _seed_bars(db, spy.id, close=450.0)

    run_id = _run_agent_and_collect(db, "SPY")

    rows = db.query(BenchmarkEquityPoint).filter_by(run_id=run_id).all()
    kinds = {r.kind for r in rows}
    assert kinds == {str(BenchmarkKind.ASSET_BUYHOLD)}


@pytestmark_orchestration
def test_backtest_run_still_succeeds_with_benchmarks(db) -> None:
    """Smoke: benchmark computation never blocks the run from completing."""
    _seed_strategy_rows(db)
    aapl = Asset(symbol="AAPL", asset_class=AssetClass.EQUITY, name="Apple", exchange="NASDAQ")
    db.add(aapl)
    db.commit()
    db.refresh(aapl)
    _seed_bars(db, aapl.id, close=180.0)

    run_id = _run_agent_and_collect(db, "AAPL")
    run = db.get(BacktestRun, run_id)
    assert run is not None
    assert run.status == "completed"
