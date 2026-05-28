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
* ``report_run``      — markdown report with "Key findings" + "Limitations".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.agents.base import BaseAgent
from backend.config import settings
from backend.database.models import Asset, BacktestRun, LLMConversation, Metric, Strategy, Trade
from backend.llm import ChatMessage, LLMFactory, LLMProvider
from backend.strategies import STRATEGY_REGISTRY
from backend.timeutils import utcnow

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
        elif payload.op == "report_run":
            user_prompt = self._build_report_prompt(payload)
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
            self._persist_turn(
                payload.run_id, "user", user_prompt, response.model, 0, 0, op=payload.op,
            )
            self._persist_turn(
                payload.run_id, "assistant", response.text,
                response.model, response.prompt_tokens, response.completion_tokens,
                op=payload.op,
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

    def _build_report_prompt(self, payload: ExplanationAgentInput) -> str:
        if payload.run_id is None:
            raise ValueError("report_run requires run_id")
        ctx = self._load_run_context(payload.run_id)
        return (
            "Write a thorough, in-depth post-backtest report for a retail "
            "quantitative trader. Output Markdown only. The report MUST be "
            "comprehensive — short, vague, or one-sentence summaries are "
            "unacceptable. Aim for roughly 600–900 words of substantive "
            "analysis.\n\n"
            "Use exactly the following section structure, each with its own "
            "'##' heading:\n\n"
            "1. '## Executive summary' — 2–3 paragraphs giving the bottom "
            "line: what strategy was tested, on what asset, over what period, "
            "and the single most important takeaway about whether it worked.\n"
            "2. '## Performance analysis' — interpret the headline return and "
            "risk-adjusted metrics one by one (CAGR, Sharpe, Sortino, Calmar, "
            "annualised volatility, max drawdown). For EACH metric: cite the "
            "exact numeric value, judge it as good / mediocre / concerning "
            "with reference to typical retail benchmarks, explain in plain "
            "language WHY that judgement holds, and tie it back to the "
            "strategy's intent.\n"
            "3. '## Trade behaviour' — interpret win rate, profit factor, "
            "total trade count, average trade P&L, and any other trade-level "
            "metrics provided. Diagnose whether the equity curve is driven by "
            "a few outsized winners, by consistent edge, or by something "
            "fragile. Comment on whether the sample size is large enough for "
            "the metrics to be statistically meaningful.\n"
            "4. '## Risks & limitations' — call out the most relevant risks "
            "given THIS run's configuration: overfitting risk if parameter "
            "count is high relative to trade count, regime sensitivity given "
            "the date range, transaction-cost sensitivity given the "
            "commission/slippage settings, single-asset concentration, the "
            "look-ahead-bias caveats inherent to daily-bar backtests, and "
            "survivorship bias.\n"
            "5. '## Suggested next steps' — 3–5 concrete actions the trader "
            "could take to validate or improve the strategy (walk-forward "
            "split, parameter sensitivity scan, commission/slippage stress "
            "test, out-of-sample regime test on a different date range, "
            "multi-asset extension, etc.). Each step should be a full "
            "sentence explaining what to do AND why.\n\n"
            "Rules:\n"
            "- Use the EXACT numeric values from the metrics provided. Round "
            "to no fewer than 2 significant figures. Do NOT invent metrics "
            "that aren't supplied.\n"
            "- Prefer well-developed paragraphs over one-line bullets. When "
            "you do use bullets, make each one a complete sentence with "
            "reasoning, not a headline.\n"
            "- Never apologise for the length or describe the report as "
            "'concise' — produce the full analysis the trader is asking for.\n\n"
            f"Backtest context (JSON-ish):\n{ctx}"
        )

    # ------------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------------
    def _load_metrics(self, run_id: int) -> dict[str, float]:
        rows = self.db.execute(
            select(Metric).where(Metric.run_id == run_id)
        ).scalars().all()
        return {r.metric_name: r.value for r in rows}

    def _load_run_context(self, run_id: int) -> dict[str, Any]:
        """Assemble the dict of run, asset, strategy, metrics + trade count
        that is fed to the LLM for the ``report_run`` op."""
        run = self.db.get(BacktestRun, run_id)
        if run is None:
            raise ValueError(f"Run {run_id} not found")

        asset = self.db.get(Asset, run.asset_id)
        strategy_row = self.db.get(Strategy, run.strategy_id)
        strategy_cls = STRATEGY_REGISTRY.get(strategy_row.slug) if strategy_row else None
        trade_count = self.db.execute(
            select(func.count(Trade.id)).where(Trade.run_id == run_id)
        ).scalar_one()

        return {
            "run_id": run_id,
            "asset": {
                "symbol": asset.symbol if asset else "",
                "name": asset.name if asset else "",
                "asset_class": asset.asset_class if asset else "",
            },
            "strategy": {
                "slug": strategy_row.slug if strategy_row else "",
                "name": strategy_cls.name if strategy_cls else (strategy_row.name if strategy_row else ""),
                "description": strategy_cls.description if strategy_cls else (strategy_row.description if strategy_row else ""),
                "params": run.params or {},
            },
            "date_range": {
                "start": run.start_date.isoformat(),
                "end": run.end_date.isoformat(),
            },
            "config": {
                "initial_cash": run.initial_cash,
                "commission_bps": run.commission_bps,
                "slippage_bps": run.slippage_bps,
                "timeframe": run.timeframe,
            },
            "metrics": self._load_metrics(run_id),
            "trade_count": int(trade_count),
        }

    def get_cached_report(self, run_id: int) -> ExplanationAgentOutput | None:
        """Return the latest persisted report for this run, or None.

        Looks up the most recent ``assistant`` turn tagged ``op='report_run'``
        in ``llm_conversations``. Hitting the cache costs zero LLM calls.
        """
        row = self.db.execute(
            select(LLMConversation)
            .where(
                LLMConversation.run_id == run_id,
                LLMConversation.role == "assistant",
                LLMConversation.op == "report_run",
            )
            .order_by(LLMConversation.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row is None:
            return None
        return ExplanationAgentOutput(
            op="report_run",
            text=row.content,
            model=row.model,
            prompt_tokens=row.prompt_tokens,
            completion_tokens=row.completion_tokens,
        )

    def get_cached_report_timestamp(self, run_id: int) -> datetime | None:
        """Return the ``created_at`` of the cached report, or None."""
        ts = self.db.execute(
            select(LLMConversation.created_at)
            .where(
                LLMConversation.run_id == run_id,
                LLMConversation.role == "assistant",
                LLMConversation.op == "report_run",
            )
            .order_by(LLMConversation.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        return ts

    def report_timestamps(self, run_ids: list[int]) -> dict[int, datetime]:
        """Latest report timestamp per run, for the runs that have one. One query."""
        if not run_ids:
            return {}
        rows = self.db.execute(
            select(LLMConversation.run_id, func.max(LLMConversation.created_at))
            .where(
                LLMConversation.run_id.in_(run_ids),
                LLMConversation.role == "assistant",
                LLMConversation.op == "report_run",
            )
            .group_by(LLMConversation.run_id)
        ).all()
        return {run_id: ts for run_id, ts in rows}

    def _persist_turn(
        self,
        run_id: int,
        role: str,
        content: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        op: str | None = None,
    ) -> None:
        self.db.add(
            LLMConversation(
                run_id=run_id,
                role=role,
                content=content,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                op=op,
                created_at=utcnow(),
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
