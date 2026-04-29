"""OrchestratorAgent — the LLM-powered top-level dispatcher.

In v1 the API exposes structured endpoints directly (so the orchestrator is
not on the request path). The class is fully written so flipping
``LLM_ENABLED=true`` and supplying a working ``LLMProvider`` activates it
without touching anything else.

How it works (when enabled)
---------------------------
1. The user sends either a structured request or a natural-language one.
2. The orchestrator builds a system prompt advertising the **tools** it can
   call (each tool is one of the deterministic agents).
3. It calls ``LLMProvider.generate`` in a tool-use loop:
   - parse model output for tool-call JSON
   - dispatch to the corresponding agent
   - feed the result back to the model
4. Once the model emits a final answer (no tool call), return that.

For v1 we ship the scaffolding; the tool-call parser is a simple
JSON-fenced format the team can swap for provider-native function-calling
when GeminiProvider lands.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from backend.agents.analytics_agent import AnalyticsAgent, AnalyticsAgentInput
from backend.agents.backtest_agent import BacktestAgent, BacktestAgentInput
from backend.agents.base import BaseAgent
from backend.agents.data_agent import DataAgent, DataAgentInput
from backend.agents.explanation_agent import ExplanationAgent, ExplanationAgentInput
from backend.agents.strategy_agent import StrategyAgent, StrategyAgentInput
from backend.config import settings
from backend.llm import ChatMessage, LLMFactory, LLMProvider


ORCHESTRATOR_SYSTEM_PROMPT = """\
You are the orchestrator for a retail backtesting platform. You receive user
requests (structured or natural language) and accomplish them by calling the
following tools, exactly one per turn:

- data: refresh / freshness / list_assets   (input: DataAgentInput JSON)
- strategy: list / build / walk_forward_split  (input: StrategyAgentInput)
- backtest: runs a backtest                   (input: BacktestAgentInput)
- analytics: metrics / chart                   (input: AnalyticsAgentInput)
- explanation: explains results in plain language

Reply ONLY in JSON of the form:

  {"tool": "<name>", "input": {...}}

When you have collected enough information to answer, reply:

  {"final": "<answer text>"}
"""


# -----------------------------------------------------------------------------
# I/O
# -----------------------------------------------------------------------------
@dataclass(slots=True)
class OrchestratorInput:
    user_message: str
    history: list[ChatMessage] = field(default_factory=list)
    max_steps: int = 8


@dataclass(slots=True)
class OrchestratorOutput:
    final_answer: str
    steps: list[dict[str, Any]]


# -----------------------------------------------------------------------------
# Agent
# -----------------------------------------------------------------------------
class OrchestratorAgent(BaseAgent[OrchestratorInput, OrchestratorOutput]):
    name = "orchestrator"

    def __init__(self, db: Session, provider: LLMProvider | None = None) -> None:
        super().__init__()
        self.db = db
        self.provider = provider or LLMFactory.from_settings()
        self.agents: dict[str, BaseAgent] = {
            "data": DataAgent(db),
            "strategy": StrategyAgent(),
            "backtest": BacktestAgent(db),
            "analytics": AnalyticsAgent(db),
            "explanation": ExplanationAgent(db, self.provider),
        }
        # name → input dataclass — used to deserialize tool inputs.
        self._input_types: dict[str, type] = {
            "data": DataAgentInput,
            "strategy": StrategyAgentInput,
            "backtest": BacktestAgentInput,
            "analytics": AnalyticsAgentInput,
            "explanation": ExplanationAgentInput,
        }

    # ------------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------------
    def _run(self, payload: OrchestratorInput) -> OrchestratorOutput:
        if not settings.llm_enabled:
            return OrchestratorOutput(
                final_answer=(
                    "[Orchestrator demo mode] LLM is disabled. The platform exposes "
                    "structured endpoints directly — call /backtests, /strategies, etc. "
                    "Enable Gemini to use natural-language requests."
                ),
                steps=[],
            )

        messages = [*payload.history, ChatMessage(role="user", content=payload.user_message)]
        steps: list[dict[str, Any]] = []

        for _step in range(payload.max_steps):
            response = self.provider.generate(
                messages=messages,
                system=ORCHESTRATOR_SYSTEM_PROMPT,
                max_tokens=settings.llm_max_tokens,
                temperature=settings.llm_temperature,
            )
            decision = self._parse_decision(response.text)
            if "final" in decision:
                return OrchestratorOutput(final_answer=decision["final"], steps=steps)

            tool = decision.get("tool")
            tool_input = decision.get("input", {})
            if tool not in self.agents:
                raise ValueError(f"Orchestrator picked unknown tool: {tool!r}")
            input_obj = self._input_types[tool](**tool_input)
            agent = self.agents[tool]
            tool_result = agent.run(input_obj)

            steps.append({"tool": tool, "input": tool_input, "result_summary": str(tool_result)[:500]})
            messages.append(ChatMessage(role="assistant", content=response.text))
            messages.append(ChatMessage(role="user", content=f"TOOL_RESULT: {tool_result}"))

        # Reached step limit without a final answer.
        return OrchestratorOutput(
            final_answer="[Orchestrator] Reached max_steps without a final answer.",
            steps=steps,
        )

    # ------------------------------------------------------------------------
    # Tool-call parser — replaceable with provider-native function calling.
    # ------------------------------------------------------------------------
    @staticmethod
    def _parse_decision(text: str) -> dict[str, Any]:
        """Extract a JSON object from the model's reply.

        The orchestrator's system prompt asks for pure JSON; we tolerate
        Markdown fences or surrounding prose by finding the outermost
        ``{...}``.
        """
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1:
                raise ValueError(f"Orchestrator could not parse: {text!r}")
            return json.loads(text[start : end + 1])
