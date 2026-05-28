"""Strategy routes — list available strategies + their JSON-Schema params."""

from __future__ import annotations

from fastapi import APIRouter

from backend.api.schemas import StrategyOut
from backend.strategies import STRATEGY_REGISTRY

router = APIRouter(prefix="/strategies", tags=["strategies"])

# Slugs that are registered for internal use (benchmark curves) but must not
# be offered to users as selectable strategies.
_HIDDEN_FROM_PICKER: frozenset[str] = frozenset({"buy-and-hold"})


@router.get("", response_model=list[StrategyOut])
def list_strategies() -> list[StrategyOut]:
    """The frontend uses this to populate the strategy library and to
    auto-render the parameter form."""
    return [
        StrategyOut(
            slug=cls.slug,
            name=cls.name,
            description=cls.description,
            category=cls.category,
            params_schema=cls.params_schema(),
        )
        for cls in STRATEGY_REGISTRY.values()
        if cls.slug not in _HIDDEN_FROM_PICKER
    ]
