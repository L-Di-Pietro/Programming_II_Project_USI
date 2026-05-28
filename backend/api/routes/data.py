"""Data routes — list assets, refresh OHLCV bars."""

from __future__ import annotations

from datetime import date, timedelta

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


def _as_date(value: object) -> date:
    """SQLite returns `date(ts)` as a str; Postgres as a date. Normalize."""
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def _fold_ranges(dates: list[date]) -> list[tuple[str, str]]:
    """Fold a sorted, distinct date list into inclusive [start, end] runs of
    consecutive calendar days. Crypto → one range; equities → one per week."""
    ranges: list[tuple[str, str]] = []
    start = end = None
    for d in dates:
        if start is None:
            start = end = d
        elif d == end + timedelta(days=1):
            end = d
        else:
            ranges.append((start.isoformat(), end.isoformat()))
            start = end = d
    if start is not None:
        ranges.append((start.isoformat(), end.isoformat()))
    return ranges


@router.get("", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_session)) -> list[AssetOut]:
    """Return every active asset, each with its per-timeframe data coverage.

    Coverage carries the overall bounds plus the run-length-encoded set of
    present days, so the frontend can clamp the Backtest Period and mark which
    in-range days actually have data. One ordered query — no per-asset round-trips.
    """
    assets = db.execute(select(Asset).where(Asset.is_active.is_(True))).scalars().all()

    day_rows = db.execute(
        select(OHLCVBar.asset_id, OHLCVBar.timeframe, func.date(OHLCVBar.ts))
        .group_by(OHLCVBar.asset_id, OHLCVBar.timeframe, func.date(OHLCVBar.ts))
        .order_by(OHLCVBar.asset_id, OHLCVBar.timeframe, func.date(OHLCVBar.ts))
    ).all()

    dates_by_key: dict[tuple[int, str], list[date]] = {}
    for asset_id, timeframe, day in day_rows:
        dates_by_key.setdefault((asset_id, timeframe), []).append(_as_date(day))

    coverage: dict[int, dict[str, DateBounds]] = {}
    for (asset_id, timeframe), dates in dates_by_key.items():
        ranges = _fold_ranges(dates)
        coverage.setdefault(asset_id, {})[timeframe] = DateBounds(
            first=ranges[0][0], last=ranges[-1][1], ranges=ranges
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
