"""Explanation routes — LLM Q&A over a backtest run.

In v1 the route is live and exercised by the UI; the underlying provider is
the ``NullProvider`` so responses are canned demo text. Activating Gemini
is a config change (see ``backend/llm/gemini_provider.py``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.agents.explanation_agent import ExplanationAgent, ExplanationAgentInput
from backend.api.schemas import ExplainRequest, ExplainResponse
from backend.database import get_session

router = APIRouter(prefix="/explain", tags=["explanation"])


@router.post("", response_model=ExplainResponse)
def explain(
    request: ExplainRequest,
    db: Session = Depends(get_session),
) -> ExplainResponse:
    agent = ExplanationAgent(db)
    try:
        result = agent.run(
            ExplanationAgentInput(
                op=request.op,
                run_id=request.run_id,
                other_run_id=request.other_run_id,
                metric_name=request.metric_name,
                strategy_slug=request.strategy_slug,
                user_question=request.user_question,
            )
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    return ExplainResponse(
        op=result.op,
        text=result.text,
        model=result.model,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        demo_mode=agent.is_demo_mode,
    )
