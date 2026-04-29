"""ExplanationAgent — natural-language descriptions of metrics & strategies.

Disabled in v1 in the sense that the configured ``LLMProvider`` is the
``NullProvider``, which returns deterministic canned text. The agent's
prompt-building, message-formatting, and persistence logic are fully
written so that flipping ``LLM_ENABLED=true`` and implementing
``GeminiProvider.generate`` activates real responses without touching this
file.

Ops
---
* ``explain_metric``  — short paragraph explaining one KPI in context.
* ``explain_strategy``— what a strategy does, when it works/fails.
* ``compare_runs``    — side-by-side commentary on two runs.
* ``answer_question`` — open-ended Q&A grounded on a run's metrics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.base import BaseAgent
from backend.config import settings
from backend.database.models import LLMConversation, Metric
from backend.llm import ChatMessage, LLMFactory, LLMProvider
from backend.strategies import STRATEGY_REGISTRY


SYSTEM_PROMPT = """\
You are an expert quantitative analyst who explains backtest results to retail
traders in plain language. Your tone is precise but friendly — never patronising.
You always cite the metric or chart you are discussing. You never hallucinate
numbers; if a metric is not provided, you say so. You highlight known biases
(survivorship, look-ahead, overfitting, calendar mismatch) when they are
relevant.
"""


# -----------------------------------------------------------------------------
# I/O dataclasses
# -----------------------------------------------------------------------------
@dataclass(slots=True)
class ExplanationAgentInput:
    op: str                            # see Ops in module docstring
    run_id: int | None = None
    other_run_id: int | None = None    # for compare_runs
    metric_name: str | None = None
    strategy_slug: str | None = None
    user_question: str | None = None
    history: list[ChatMessage] = field(default_factory=list)


@dataclass(slots=True)
class ExplanationAgentOutput:
    op: str
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int


# -----------------------------------------------------------------------------
# Agent
# -----------------------------------------------------------------------------
class ExplanationAgent(BaseAgent[ExplanationAgentInput, ExplanationAgentOutput]):
    name = "explanation"

    def __init__(self, db: Session, provider: LLMProvider | None = None) -> None:
        super().__init__()
        self.db = db
        self.provider: LLMProvider = provider or LLMFactory.from_settings()

    def _run(self, payload: ExplanationAgentInput) -> ExplanationAgentOutput:
        # Build the user-prompt for the requested op. Each branch only differs
        # in *what* it tells the LLM; the call structure is identical.
        if payload.op == "explain_metric":
            user_prompt = self._build_metric_prompt(payload)
        elif payload.op == "explain_strategy":
            user_prompt = self._build_strategy_prompt(payload)
        elif payload.op == "compare_runs":
            user_prompt = self._build_compare_prompt(payload)
        elif payload.op == "answer_question":
            user_prompt = self._build_question_prompt(payload)
        else:
            raise ValueError(f"Unknown ExplanationAgent op: {payload.op!r}")

        messages = [*payload.history, ChatMessage(role="user", content=user_prompt)]
        response = self.provider.generate(
            messages=messages,
            system=SYSTEM_PROMPT,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
        )

        if payload.run_id is not None:
            self._persist_turn(payload.run_id, "user", user_prompt, response.model, 0, 0)
            self._persist_turn(
                payload.run_id, "assistant", response.text,
                response.model, response.prompt_tokens, response.completion_tokens,
            )

        return ExplanationAgentOutput(
            op=payload.op,
            text=response.text,
            model=response.model,
            prompt_tokens=response.prompt_tokens,
            completion_tokens=response.completion_tokens,
        )

    # ------------------------------------------------------------------------
    # Prompt builders — kept pure so they're trivially testable.
    # ------------------------------------------------------------------------
    def _build_metric_prompt(self, payload: ExplanationAgentInput) -> str:
        if payload.run_id is None or payload.metric_name is None:
            raise ValueError("explain_metric requires run_id and metric_name")
        metrics = self._load_metrics(payload.run_id)
        target = metrics.get(payload.metric_name)
        if target is None:
            raise ValueError(f"Metric {payload.metric_name!r} not found for run {payload.run_id}")
        return (
            f"In the most recent backtest the {payload.metric_name} is {target:.4f}. "
            "Explain what this metric means, whether the value is good or bad in "
            "context, and one concrete next step the trader should consider. "
            f"Other metrics for context: {metrics}."
        )

    def _build_strategy_prompt(self, payload: ExplanationAgentInput) -> str:
        if payload.strategy_slug is None:
            raise ValueError("explain_strategy requires strategy_slug")
        cls = STRATEGY_REGISTRY.get(payload.strategy_slug)
        if cls is None:
            raise ValueError(f"Strategy {payload.strategy_slug!r} not registered")
        return (
            f"Explain the {cls.name!r} strategy to a retail trader. "
            f"Describe (1) the underlying intuition, (2) the market regime where it tends to win, "
            f"(3) the regime where it tends to lose, and (4) two practical ways the trader could "
            f"stress-test it. The strategy's existing description is: {cls.description}"
        )

    def _build_compare_prompt(self, payload: ExplanationAgentInput) -> str:
        if payload.run_id is None or payload.other_run_id is None:
            raise ValueError("compare_runs requires run_id and other_run_id")
        a = self._load_metrics(payload.run_id)
        b = self._load_metrics(payload.other_run_id)
        return (
            f"Compare these two backtest runs side by side and tell the trader which one looks "
            f"more robust, why, and what risks each one masks.\n\n"
            f"Run A (id {payload.run_id}): {a}\n\nRun B (id {payload.other_run_id}): {b}"
        )

    def _build_question_prompt(self, payload: ExplanationAgentInput) -> str:
        if payload.run_id is None or payload.user_question is None:
            raise ValueError("answer_question requires run_id and user_question")
        metrics = self._load_metrics(payload.run_id)
        return (
            f"User question about backtest run {payload.run_id}: {payload.user_question}\n\n"
            f"Metrics for context: {metrics}\n\n"
            "Answer concisely and ground every statement in the metrics provided."
        )

    # ------------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------------
    def _load_metrics(self, run_id: int) -> dict[str, float]:
        rows = self.db.execute(
            select(Metric).where(Metric.run_id == run_id)
        ).scalars().all()
        return {r.metric_name: r.value for r in rows}

    def _persist_turn(
        self,
        run_id: int,
        role: str,
        content: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> None:
        self.db.add(
            LLMConversation(
                run_id=run_id,
                role=role,
                content=content,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                created_at=datetime.utcnow(),
            )
        )
        self.db.commit()

    # ------------------------------------------------------------------------
    # Misc helpers exposed for the API layer
    # ------------------------------------------------------------------------
    @property
    def is_demo_mode(self) -> bool:
        """True when the underlying provider is the NullProvider."""
        return self.provider.name == "null"


def _unused_placeholder() -> Any:  # pragma: no cover
    """Placeholder kept so editors don't fold the module trailing whitespace."""
    return None
