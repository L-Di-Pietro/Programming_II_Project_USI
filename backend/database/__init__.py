"""Database package — SQLAlchemy models + engine + session factory.

Re-export the most-used names so call sites can do
``from backend.database import Base, get_session`` instead of reaching into
sub-modules.
"""

from backend.database.connection import Base, engine, get_session, init_db
from backend.database.models import (
    Asset,
    BacktestRun,
    EquityPoint,
    LLMConversation,
    Metric,
    OHLCVBar,
    Strategy,
    Trade,
)

__all__ = [
    "Base",
    "engine",
    "get_session",
    "init_db",
    "Asset",
    "BacktestRun",
    "EquityPoint",
    "LLMConversation",
    "Metric",
    "OHLCVBar",
    "Strategy",
    "Trade",
]
