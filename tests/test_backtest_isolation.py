"""Per-browser isolation: list_backtests returns only the caller's own runs.

Exercises the route handler directly (the repo convention — see
test_report_route.py), so no TestClient / app lifespan is needed.
"""

from __future__ import annotations

from datetime import datetime

from backend.api.routes.backtest import list_backtests
from backend.database.models import Asset, BacktestRun, RunStatus, Strategy
from backend.timeutils import utcnow


def _seed(db) -> tuple[int, int]:
    """Seed one asset + strategy, a run for 'alice', a run for 'bob', and a
    legacy run with client_id=None. Returns (alice_run_id, bob_run_id)."""
    asset = Asset(symbol="AAPL", asset_class="equity", name="Apple Inc.")
    strategy = Strategy(slug="sma-crossover", name="SMA Crossover")
    db.add_all([asset, strategy])
    db.flush()

    def _run(client_id: str | None) -> BacktestRun:
        return BacktestRun(
            strategy_id=strategy.id,
            asset_id=asset.id,
            client_id=client_id,
            start_date=datetime(2020, 1, 1),
            end_date=datetime(2024, 1, 1),
            params={},
            status=RunStatus.COMPLETED,
            completed_at=utcnow(),
        )

    alice, bob, legacy = _run("alice"), _run("bob"), _run(None)
    db.add_all([alice, bob, legacy])
    db.commit()
    return alice.id, bob.id


def test_list_is_scoped_to_the_caller(db):
    alice_id, bob_id = _seed(db)

    assert [r.id for r in list_backtests(client_id="alice", db=db)] == [alice_id]
    assert [r.id for r in list_backtests(client_id="bob", db=db)] == [bob_id]


def test_missing_client_id_returns_empty(db):
    """A fresh browser (no X-Client-Id) sees nothing — including legacy NULL rows."""
    _seed(db)
    assert list_backtests(client_id=None, db=db) == []
