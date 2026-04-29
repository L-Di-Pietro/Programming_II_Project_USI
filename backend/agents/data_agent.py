"""DataAgent — fetches, cleans, and persists OHLCV bars.

Deterministic. Picks the right fetcher per asset class, runs the cleaner,
then upserts into the ``ohlcv_bars`` table. Also exposes a freshness check
so the scheduler can ask "what's the latest bar I have for symbol X?".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from backend.agents.base import BaseAgent
from backend.data.cleaner import OHLCVCleaner
from backend.data.fetchers import CryptoFetcher, EquityFetcher, FXFetcher
from backend.data.fetchers.base import BaseFetcher
from backend.database.models import Asset, AssetClass, OHLCVBar, Timeframe


# -----------------------------------------------------------------------------
# I/O dataclasses
# -----------------------------------------------------------------------------
@dataclass(slots=True)
class DataAgentInput:
    """One of the supported "data ops"."""
    op: str  # "refresh" | "freshness" | "list_assets"
    symbol: str | None = None
    asset_id: int | None = None
    start: datetime | None = None
    end: datetime | None = None
    timeframe: str = Timeframe.DAILY


@dataclass(slots=True)
class DataAgentOutput:
    op: str
    rows_written: int = 0
    last_ts: datetime | None = None
    payload: Any = None


# -----------------------------------------------------------------------------
# Agent
# -----------------------------------------------------------------------------
class DataAgent(BaseAgent[DataAgentInput, DataAgentOutput]):
    name = "data"

    # asset_class → fetcher instance
    _FETCHERS: dict[str, type[BaseFetcher]] = {
        AssetClass.EQUITY: EquityFetcher,
        AssetClass.ETF: EquityFetcher,
        AssetClass.CRYPTO: CryptoFetcher,
        AssetClass.FX: FXFetcher,
    }

    def __init__(self, db: Session) -> None:
        super().__init__()
        self.db = db
        self.cleaner = OHLCVCleaner(calendar="nyse")

    # ------------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------------
    def _run(self, payload: DataAgentInput) -> DataAgentOutput:
        if payload.op == "refresh":
            return self._refresh(payload)
        if payload.op == "freshness":
            return self._freshness(payload)
        if payload.op == "list_assets":
            return self._list_assets()
        raise ValueError(f"Unknown DataAgent op: {payload.op!r}")

    # ------------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------------
    def _refresh(self, payload: DataAgentInput) -> DataAgentOutput:
        if payload.symbol is None:
            raise ValueError("refresh requires symbol")

        asset = self._asset_by_symbol(payload.symbol)
        fetcher = self._FETCHERS[AssetClass(asset.asset_class)]()

        end = payload.end or datetime.utcnow()
        # If we already have data, only fetch the gap (incremental). Otherwise
        # default to 10 years.
        last_ts = self._last_bar_ts(asset.id, payload.timeframe)
        if payload.start is not None:
            start = payload.start
        elif last_ts is not None:
            # Re-fetch the last day too, in case it was incomplete.
            start = last_ts - timedelta(days=1)
        else:
            start = end - timedelta(days=365 * 10)

        raw = fetcher.fetch(payload.symbol, start, end)
        clean, _report = self.cleaner.clean(raw, start=start, end=end)

        rows_written = self._upsert_bars(asset.id, clean, payload.timeframe, fetcher.source_name)
        new_last = self._last_bar_ts(asset.id, payload.timeframe)

        return DataAgentOutput(op="refresh", rows_written=rows_written, last_ts=new_last)

    def _freshness(self, payload: DataAgentInput) -> DataAgentOutput:
        if payload.asset_id is None:
            raise ValueError("freshness requires asset_id")
        last = self._last_bar_ts(payload.asset_id, payload.timeframe)
        return DataAgentOutput(op="freshness", last_ts=last)

    def _list_assets(self) -> DataAgentOutput:
        assets = self.db.execute(select(Asset).where(Asset.is_active.is_(True))).scalars().all()
        return DataAgentOutput(op="list_assets", payload=list(assets))

    # ------------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------------
    def _asset_by_symbol(self, symbol: str) -> Asset:
        asset = self.db.execute(
            select(Asset).where(Asset.symbol == symbol)
        ).scalar_one_or_none()
        if asset is None:
            raise ValueError(f"No asset registered for symbol {symbol!r}")
        return asset

    def _last_bar_ts(self, asset_id: int, timeframe: str) -> datetime | None:
        row = self.db.execute(
            select(OHLCVBar.ts)
            .where(OHLCVBar.asset_id == asset_id, OHLCVBar.timeframe == timeframe)
            .order_by(OHLCVBar.ts.desc())
            .limit(1)
        ).first()
        return row[0] if row else None

    def _upsert_bars(
        self, asset_id: int, df: pd.DataFrame, timeframe: str, source: str
    ) -> int:
        if df.empty:
            return 0
        rows = [
            {
                "asset_id": asset_id,
                "ts": ts.to_pydatetime(),
                "timeframe": timeframe,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"]),
                "source": source,
            }
            for ts, row in df.iterrows()
        ]
        # SQLite-flavoured upsert. The same statement works on Postgres if we
        # swap to ``postgresql.insert`` in the future.
        stmt = sqlite_insert(OHLCVBar).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["asset_id", "ts", "timeframe"],
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
                "source": stmt.excluded.source,
            },
        )
        self.db.execute(stmt)
        self.db.commit()
        return len(rows)
