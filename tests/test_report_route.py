"""Tests for the GET/POST /backtests/{id}/report endpoints.

The route handlers are exercised directly (not via TestClient) — the handlers
ARE the logic; FastAPI only routes to them. This keeps tests fast and avoids
spinning up the full app lifespan (scheduler, real engine, etc.) for every
case.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException

from backend.api.routes.backtest import generate_report, get_report
from backend.database.models import (
    Asset,
    BacktestRun,
    LLMConversation,
    Metric,
    MetricCategory,
    RunStatus,
    Strategy,
)


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _seed_run(db) -> int:
    """Seed an asset, strategy, run, and a few metrics. Returns run_id."""
    asset = Asset(symbol="AAPL", asset_class="equity", name="Apple Inc.")
    strategy = Strategy(
        slug="sma-crossover",
        name="SMA Crossover",
        description="Trend-following moving-average crossover.",
    )
    db.add_all([asset, strategy])
    db.flush()

    run = BacktestRun(
        strategy_id=strategy.id,
        asset_id=asset.id,
        start_date=datetime(2020, 1, 1),
        end_date=datetime(2024, 1, 1),
        params={"fast": 10, "slow": 30},
        commission_bps=5.0,
        slippage_bps=2.0,
        initial_cash=10_000.0,
        status=RunStatus.COMPLETED,
        completed_at=datetime.utcnow(),
    )
    db.add(run)
    db.flush()

    db.add_all([
        Metric(run_id=run.id, metric_name="cagr_pct", value=12.3, category=MetricCategory.RETURN),
        Metric(run_id=run.id, metric_name="sharpe_ratio", value=1.1, category=MetricCategory.RISK),
    ])
    db.commit()
    return run.id


# -----------------------------------------------------------------------------
# GET — cache miss / hit
# -----------------------------------------------------------------------------
def test_get_report_returns_404_when_run_does_not_exist(db):
    with pytest.raises(HTTPException) as exc:
        get_report(run_id=9999, db=db)
    assert exc.value.status_code == 404


def test_get_report_returns_404_when_no_report_yet(db):
    run_id = _seed_run(db)
    with pytest.raises(HTTPException) as exc:
        get_report(run_id=run_id, db=db)
    assert exc.value.status_code == 404
    # No LLM conversation rows should have been written by the GET.
    assert db.query(LLMConversation).count() == 0


# -----------------------------------------------------------------------------
# POST — generate (default config: NullProvider, demo mode)
# -----------------------------------------------------------------------------
def test_post_report_generates_and_returns_demo_payload(db):
    run_id = _seed_run(db)
    resp = generate_report(run_id=run_id, db=db)

    assert resp.cached is False
    assert resp.demo_mode is True              # NullProvider in tests
    assert "DEMO MODE" in resp.text
    assert resp.model == "null-provider"
    assert isinstance(resp.generated_at, datetime)


def test_post_report_404_when_run_does_not_exist(db):
    with pytest.raises(HTTPException) as exc:
        generate_report(run_id=9999, db=db)
    assert exc.value.status_code == 404


# -----------------------------------------------------------------------------
# Full cycle — GET 404 → POST → GET cached → POST regenerate
# -----------------------------------------------------------------------------
def test_full_report_lifecycle(db):
    run_id = _seed_run(db)

    # 1. No report yet → GET returns 404.
    with pytest.raises(HTTPException) as exc:
        get_report(run_id=run_id, db=db)
    assert exc.value.status_code == 404

    # 2. POST generates a fresh report.
    first = generate_report(run_id=run_id, db=db)
    assert first.cached is False

    # 3. GET now returns the cached report (no LLM call should have run).
    cached = get_report(run_id=run_id, db=db)
    assert cached.cached is True
    assert cached.text == first.text
    assert cached.generated_at == first.generated_at

    # Two LLMConversation rows: one user, one assistant — both tagged report_run.
    rows = db.query(LLMConversation).filter_by(run_id=run_id).all()
    assert len(rows) == 2
    assert all(r.op == "report_run" for r in rows)

    # 4. POST again (Regenerate) — must produce a NEW row pair and become the
    #    visible cached report.
    second = generate_report(run_id=run_id, db=db)
    assert second.cached is False

    # Now four rows total: two from each generate call.
    rows = db.query(LLMConversation).filter_by(run_id=run_id).all()
    assert len(rows) == 4
    assert all(r.op == "report_run" for r in rows)

    # The latest GET must reflect the most recent POST's content.
    cached_after_regen = get_report(run_id=run_id, db=db)
    assert cached_after_regen.cached is True
    assert cached_after_regen.text == second.text
    # NullProvider is deterministic for the same prompt — but the prompt
    # contains the run_id and metrics, so equal text is expected here.
    # Even so, generated_at advances (or stays equal within timer resolution).
    assert cached_after_regen.generated_at >= first.generated_at


def test_other_op_conversations_do_not_shadow_cache(db):
    """A free-form Q&A turn must NOT show up as a cached report."""
    from backend.agents.explanation_agent import ExplanationAgent, ExplanationAgentInput
    from backend.llm import NullProvider

    run_id = _seed_run(db)

    # Free-form Q&A first.
    ExplanationAgent(db, provider=NullProvider()).run(
        ExplanationAgentInput(
            op="answer_question", run_id=run_id, user_question="why?"
        )
    )

    # GET still returns 404 because the cache only matches op="report_run".
    with pytest.raises(HTTPException) as exc:
        get_report(run_id=run_id, db=db)
    assert exc.value.status_code == 404
