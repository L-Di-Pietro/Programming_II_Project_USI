"""Data routes — list assets, refresh OHLCV bars."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.data_agent import DataAgent, DataAgentInput
from backend.api.schemas import AssetOut, RefreshResponse
from backend.database import get_session
from backend.database.models import Asset

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_session)) -> list[Asset]:
    """Return every active asset in the universe."""
    return db.execute(select(Asset).where(Asset.is_active.is_(True))).scalars().all()


@router.post("/{symbol}/refresh", response_model=RefreshResponse)
def refresh_asset(
    symbol: str,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
) -> RefreshResponse:
    """Fetch the latest bars for ``symbol`` and upsert them.

    Synchronous in v1 — daily fetches finish in seconds. If a user runs this
    on a 10-year cold cache it could take ~30s for crypto; consider moving
    that path to a BackgroundTask.
    """
    agent = DataAgent(db)
    try:
        result = agent.run(DataAgentInput(op="refresh", symbol=symbol))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return RefreshResponse(symbol=symbol, rows_written=result.rows_written, last_ts=result.last_ts)
