"""Data routes — list assets, refresh OHLCV bars."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.agents.base import AgentError
from backend.agents.data_agent import DataAgent, DataAgentInput
from backend.api.schemas import AssetOut, DateBounds, RefreshResponse, Timeframe
from backend.data.fetchers.base import FetcherError
from backend.database import get_session
from backend.database.models import Asset, OHLCVBar

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_session)) -> list[AssetOut]:
    """Return every active asset, each with its per-timeframe data coverage.

    Coverage (first/last available bar date) lets the frontend bound and clamp
    the Backtest Period pickers. Computed in one aggregate query — no per-asset
    round-trips.
    """
    assets = db.execute(select(Asset).where(Asset.is_active.is_(True))).scalars().all()

    bounds_rows = db.execute(
        select(
            OHLCVBar.asset_id,
            OHLCVBar.timeframe,
            func.min(OHLCVBar.ts),
            func.max(OHLCVBar.ts),
        ).group_by(OHLCVBar.asset_id, OHLCVBar.timeframe)
    ).all()

    coverage: dict[int, dict[str, DateBounds]] = {}
    for asset_id, timeframe, first_ts, last_ts in bounds_rows:
        coverage.setdefault(asset_id, {})[timeframe] = DateBounds(
            first=first_ts.date().isoformat(),
            last=last_ts.date().isoformat(),
        )

    return [
        AssetOut(
            id=a.id,
            symbol=a.symbol,
            asset_class=a.asset_class,
            name=a.name,
            exchange=a.exchange,
            currency=a.currency,
            is_active=a.is_active,
            coverage=coverage.get(a.id, {}),
        )
        for a in assets
    ]


@router.post("/{symbol}/refresh", response_model=RefreshResponse)
def refresh_asset(
    symbol: str,
    background: BackgroundTasks,
    timeframe: Timeframe = Timeframe.DAILY,
    db: Session = Depends(get_session),
) -> RefreshResponse:
    """Fetch the latest bars for ``symbol`` at the requested ``timeframe`` and
    upsert them.

    Synchronous in v1 — daily fetches finish in seconds. Hourly fetches can
    take longer (especially for long crypto windows on Binance). If a user
    runs this on a cold cache, consider moving to a BackgroundTask.
    """
    agent = DataAgent(db)
    try:
        result = agent.run(
            DataAgentInput(op="refresh", symbol=symbol, timeframe=timeframe.value)
        )
    except AgentError as e:
        # FetcherError (e.g., yfinance hourly 730-day cap) → 400.
        # ValueError ("No asset registered ...") → 404.
        # Anything else → 500 via re-raise.
        cause = e.cause
        if isinstance(cause, FetcherError):
            raise HTTPException(status_code=400, detail=str(cause)) from e
        if isinstance(cause, ValueError):
            raise HTTPException(status_code=404, detail=str(cause)) from e
        raise
    return RefreshResponse(symbol=symbol, rows_written=result.rows_written, last_ts=result.last_ts)
