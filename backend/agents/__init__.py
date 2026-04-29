"""Agents subpackage.

Six specialized agents wire deterministic services (data, strategies, engine,
analytics) and the LLM-backed services (orchestrator, explanation) into a
coherent system.
"""

from backend.agents.analytics_agent import AnalyticsAgent
from backend.agents.backtest_agent import BacktestAgent
from backend.agents.base import AgentError, BaseAgent
from backend.agents.data_agent import DataAgent
from backend.agents.explanation_agent import ExplanationAgent
from backend.agents.orchestrator import OrchestratorAgent
from backend.agents.strategy_agent import StrategyAgent

__all__ = [
    "AgentError",
    "AnalyticsAgent",
    "BacktestAgent",
    "BaseAgent",
    "DataAgent",
    "ExplanationAgent",
    "OrchestratorAgent",
    "StrategyAgent",
]
