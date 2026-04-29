"""Strategy routes — list available strategies + their JSON-Schema params."""

from __future__ import annotations

from fastapi import APIRouter

from backend.api.schemas import StrategyOut
from backend.strategies import STRATEGY_REGISTRY

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=list[StrategyOut])
def list_strategies() -> list[StrategyOut]:
    """The frontend uses this to populate the strategy library and to
    auto-render the parameter form."""
    return [
        StrategyOut(
            slug=cls.slug,
            name=cls.name,
            description=cls.description,
            params_schema=cls.params_schema(),
        )
        for cls in STRATEGY_REGISTRY.values()
    ]
