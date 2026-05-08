"""LLM provider tests — verify the abstraction layer behaves correctly even
without any external API."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from backend.agents.explanation_agent import ExplanationAgent, ExplanationAgentInput
from backend.config import Settings
from backend.database.models import (
    Asset,
    BacktestRun,
    LLMConversation,
    Metric,
    MetricCategory,
    RunStatus,
    Strategy,
)
from backend.llm import ChatMessage, GeminiProvider, LLMFactory, NullProvider


# -----------------------------------------------------------------------------
# NullProvider
# -----------------------------------------------------------------------------
def test_null_provider_returns_canned_text():
    p = NullProvider()
    response = p.generate(messages=[ChatMessage(role="user", content="hello")])
    assert "DEMO MODE" in response.text
    assert response.model == "null-provider"
    assert response.metadata.get("demo") == "true"


def test_null_provider_is_deterministic():
    p = NullProvider()
    msg = [ChatMessage(role="user", content="repeat me")]
    a = p.generate(messages=msg)
    b = p.generate(messages=msg)
    assert a.text == b.text


# -----------------------------------------------------------------------------
# Factory
# -----------------------------------------------------------------------------
def test_factory_returns_null_when_disabled():
    s = Settings(llm_enabled=False, llm_provider="gemini")
    provider = LLMFactory.from_settings(s)
    assert isinstance(provider, NullProvider)


def test_factory_returns_gemini_when_enabled():
    s = Settings(llm_enabled=True, llm_provider="gemini", gemini_api_key="fake")
    provider = LLMFactory.from_settings(s)
    assert isinstance(provider, GeminiProvider)


def test_factory_unknown_provider_raises():
    s = Settings(llm_enabled=True, llm_provider="bogus-llm")
    with pytest.raises(ValueError):
        LLMFactory.from_settings(s)


# -----------------------------------------------------------------------------
# GeminiProvider
# -----------------------------------------------------------------------------
def test_gemini_provider_rejects_empty_key():
    with pytest.raises(ValueError):
        GeminiProvider(api_key="")


def test_gemini_provider_construct_does_not_require_sdk():
    """Construction must be free of SDK imports so the factory can wire the
    provider in environments where google-generativeai is not installed."""
    p = GeminiProvider(api_key="fake")
    assert p.name == "gemini"
    assert p._configured is False


# -----------------------------------------------------------------------------
# ExplanationAgent — report_run op
# -----------------------------------------------------------------------------
def _seed_run(db, *, with_metrics: bool = True, with_trades: int = 0) -> int:
    """Create a minimal BacktestRun with optional metrics + trade rows.
    Returns the run_id."""
    asset = Asset(symbol="AAPL", asset_class="equity", name="Apple Inc.")
    strategy = Strategy(slug="sma-crossover", name="SMA Crossover", description="…")
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

    if with_metrics:
        db.add_all([
            Metric(run_id=run.id, metric_name="cagr_pct", value=12.3, category=MetricCategory.RETURN),
            Metric(run_id=run.id, metric_name="sharpe_ratio", value=1.1, category=MetricCategory.RISK),
            Metric(run_id=run.id, metric_name="max_drawdown_pct", value=18.5, category=MetricCategory.RISK),
            Metric(run_id=run.id, metric_name="total_trades", value=42, category=MetricCategory.TRADE),
        ])
    db.commit()
    return run.id


def test_report_run_with_null_provider_returns_demo_text(db):
    run_id = _seed_run(db)
    agent = ExplanationAgent(db, provider=NullProvider())
    out = agent.run(ExplanationAgentInput(op="report_run", run_id=run_id))
    assert "DEMO MODE" in out.text
    assert out.op == "report_run"
    assert out.model == "null-provider"


def test_report_run_persists_with_op_tag(db):
    run_id = _seed_run(db)
    agent = ExplanationAgent(db, provider=NullProvider())
    agent.run(ExplanationAgentInput(op="report_run", run_id=run_id))

    rows = db.execute(
        select(LLMConversation).where(LLMConversation.run_id == run_id)
    ).scalars().all()
    # One user turn + one assistant turn, both tagged op="report_run".
    assert len(rows) == 2
    assert {r.role for r in rows} == {"user", "assistant"}
    assert all(r.op == "report_run" for r in rows)


def test_report_run_prompt_includes_metrics_and_strategy(db):
    """Sanity check on the prompt builder: it must surface the metric values
    and the strategy name to the LLM."""
    run_id = _seed_run(db)
    agent = ExplanationAgent(db, provider=NullProvider())
    prompt = agent._build_report_prompt(
        ExplanationAgentInput(op="report_run", run_id=run_id)
    )
    assert "12.3" in prompt        # cagr_pct
    assert "sharpe_ratio" in prompt
    assert "AAPL" in prompt
    assert "sma-crossover" in prompt
    assert "Key findings" in prompt
    assert "Limitations" in prompt


def test_report_run_requires_run_id(db):
    agent = ExplanationAgent(db, provider=NullProvider())
    with pytest.raises(Exception):  # AgentError wraps ValueError
        agent.run(ExplanationAgentInput(op="report_run"))


def test_get_cached_report_returns_none_when_absent(db):
    run_id = _seed_run(db)
    agent = ExplanationAgent(db, provider=NullProvider())
    assert agent.get_cached_report(run_id) is None
    assert agent.get_cached_report_timestamp(run_id) is None


def test_get_cached_report_returns_latest_assistant_turn(db):
    run_id = _seed_run(db)
    agent = ExplanationAgent(db, provider=NullProvider())
    agent.run(ExplanationAgentInput(op="report_run", run_id=run_id))

    cached = agent.get_cached_report(run_id)
    assert cached is not None
    assert "DEMO MODE" in cached.text
    assert cached.op == "report_run"
    ts = agent.get_cached_report_timestamp(run_id)
    assert ts is not None
    # Newly written, so timestamp is "recent".
    assert datetime.utcnow() - ts < timedelta(seconds=10)


def test_get_cached_report_ignores_other_ops(db):
    """A free-form 'answer_question' turn must NOT shadow the report cache."""
    run_id = _seed_run(db)
    agent = ExplanationAgent(db, provider=NullProvider())
    # Free-form Q&A turn first.
    agent.run(ExplanationAgentInput(
        op="answer_question", run_id=run_id, user_question="why?"
    ))
    # No report exists yet.
    assert agent.get_cached_report(run_id) is None

    # Now generate a report.
    agent.run(ExplanationAgentInput(op="report_run", run_id=run_id))
    cached = agent.get_cached_report(run_id)
    assert cached is not None and cached.op == "report_run"


def test_explanation_agent_demo_mode_property(db):
    agent_null = ExplanationAgent(db, provider=NullProvider())
    assert agent_null.is_demo_mode is True

    agent_gemini = ExplanationAgent(db, provider=GeminiProvider(api_key="fake"))
    assert agent_gemini.is_demo_mode is False
