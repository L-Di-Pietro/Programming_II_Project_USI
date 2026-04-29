"""StrategyAgent — list strategies, validate params, build instances.

Stateless utility wrapping ``backend.strategies``. The orchestrator (or the
API layer in v1) calls this when it needs a configured strategy object.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from backend.agents.base import BaseAgent
from backend.strategies import STRATEGY_REGISTRY, BaseStrategy, get_strategy


@dataclass(slots=True)
class StrategyAgentInput:
    op: str  # "list" | "build" | "walk_forward_split"
    slug: str | None = None
    params: dict[str, Any] | None = None
    bars: pd.DataFrame | None = None
    train_pct: float = 0.7  # for walk_forward_split


@dataclass(slots=True)
class StrategyAgentOutput:
    op: str
    payload: Any = None


class StrategyAgent(BaseAgent[StrategyAgentInput, StrategyAgentOutput]):
    name = "strategy"

    def _run(self, payload: StrategyAgentInput) -> StrategyAgentOutput:
        if payload.op == "list":
            return StrategyAgentOutput(op="list", payload=self._list())
        if payload.op == "build":
            return StrategyAgentOutput(op="build", payload=self._build(payload))
        if payload.op == "walk_forward_split":
            return StrategyAgentOutput(
                op="walk_forward_split", payload=self._walk_forward_split(payload)
            )
        raise ValueError(f"Unknown StrategyAgent op: {payload.op!r}")

    # ------------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------------
    @staticmethod
    def _list() -> list[dict[str, Any]]:
        return [
            {
                "slug": cls.slug,
                "name": cls.name,
                "description": cls.description,
                "params_schema": cls.params_schema(),
            }
            for cls in STRATEGY_REGISTRY.values()
        ]

    @staticmethod
    def _build(payload: StrategyAgentInput) -> BaseStrategy:
        if payload.slug is None:
            raise ValueError("build requires slug")
        cls = get_strategy(payload.slug)
        cfg = cls.config_cls.model_validate(payload.params or {})
        return cls(cfg)

    @staticmethod
    def _walk_forward_split(payload: StrategyAgentInput) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Simple chronological split. Train = first ``train_pct``, test = rest.

        For more sophisticated rolling-window walk-forward analysis (multiple
        train/test pairs), add a higher-level helper in ``backend.backtest``.
        """
        if payload.bars is None or payload.bars.empty:
            raise ValueError("walk_forward_split requires non-empty bars")
        if not 0.1 < payload.train_pct < 0.9:
            raise ValueError("train_pct must be in (0.1, 0.9)")
        cutoff = int(len(payload.bars) * payload.train_pct)
        return payload.bars.iloc[:cutoff], payload.bars.iloc[cutoff:]
