"""One-shot bulk data fetch: hydrates the local DB with historical bars for
every seeded asset, at one or more timeframes.

Run **after** ``init_db.py``::

    python scripts/load_initial_data.py                   # daily, ~10y history
    python scripts/load_initial_data.py --timeframes 1d 1h  # both

History windows
---------------
* **Daily**: 10 years for everything.
* **Hourly, equity/ETF/FX**: capped to ~730 days because that's Yahoo
  Finance's hourly horizon. Older requests would return empty.
* **Hourly, crypto**: full 10-year window — Binance via ccxt has hourly
  candles back to ~2017 for the major pairs and silently returns no rows
  before the listing date, so this is safe.

Subsequent updates are handled by the nightly APScheduler job started inside
``backend.main``.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog

from backend.agents.data_agent import DataAgent, DataAgentInput
from backend.config import configure_logging
from backend.database.connection import SessionLocal
from backend.database.models import Asset, AssetClass

log = structlog.get_logger(__name__)


# yfinance hourly horizon — applies to equity/ETF/FX. Crypto via Binance
# is multi-year, so we don't clamp it.
_YFINANCE_HOURLY_MAX_DAYS = 730
_YFINANCE_HOURLY_CLASSES = {AssetClass.EQUITY, AssetClass.ETF, AssetClass.FX}
_DAILY_HISTORY_DAYS = 365 * 10


def _start_for(asset_class: str, timeframe: str, end: datetime) -> datetime:
    """How far back to fetch for this (asset_class, timeframe).

    Crypto hourly gets the full 10-year window because Binance keeps
    multi-year hourly history. Equity/ETF/FX hourly is capped to Yahoo's
    730-day cliff. Everything else (including all daily) is 10 years.
    """
    if timeframe == "1h" and AssetClass(asset_class) in _YFINANCE_HOURLY_CLASSES:
        return end - timedelta(days=_YFINANCE_HOURLY_MAX_DAYS - 5)
    return end - timedelta(days=_DAILY_HISTORY_DAYS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--timeframes",
        nargs="+",
        default=["1d"],
        choices=["1d", "1h"],
        help="One or more timeframes to load (default: 1d only).",
    )
    args = parser.parse_args()

    configure_logging()
    log.info("bulk_load.start", timeframes=args.timeframes)
    db = SessionLocal()
    try:
        agent = DataAgent(db)
        end = datetime.utcnow()

        for asset in db.query(Asset).filter_by(is_active=True).all():
            for tf in args.timeframes:
                tf_start = _start_for(asset.asset_class, tf, end)
                try:
                    result = agent.run(
                        DataAgentInput(
                            op="refresh",
                            symbol=asset.symbol,
                            start=tf_start,
                            end=end,
                            timeframe=tf,
                        )
                    )
                    log.info(
                        "bulk_load.asset_done",
                        symbol=asset.symbol,
                        timeframe=tf,
                        rows=result.rows_written,
                        start=tf_start.date().isoformat(),
                        last_ts=result.last_ts.isoformat() if result.last_ts else None,
                    )
                except Exception:  # one bad asset shouldn't stop the others
                    log.exception(
                        "bulk_load.asset_failed", symbol=asset.symbol, timeframe=tf
                    )
    finally:
        db.close()
    log.info("bulk_load.done")


if __name__ == "__main__":
    main()
