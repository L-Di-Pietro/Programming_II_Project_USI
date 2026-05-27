"""One-shot bulk data fetch: hydrates the local DB with historical bars for
every seeded asset, at one or more timeframes.

Run **after** ``init_db.py``::

    python scripts/load_initial_data.py                   # daily, full listing-date history
    python scripts/load_initial_data.py --timeframes 1d 1h  # both

History windows
---------------
* **Daily**: full listing-date history per ticker. We pass a 1970 epoch
  ``start`` and let yfinance return whatever it has from each ticker's
  actual inception (AAPL 1980, SPY 1993, BTC-USD 2014, …). The cleaner
  drops the pre-listing NaNs.
* **Hourly**: 729 days for every asset class — one day inside Yahoo
  Finance's 730-day hourly cap, leaving a safety margin for the race
  between computing ``end`` here and the fetcher actually calling
  yfinance. The Binance fallback inside ``CryptoFetcher`` can still
  serve older hourly bars for ad-hoc requests outside the bulk loader.

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
from backend.timeutils import utcnow

log = structlog.get_logger(__name__)


# yfinance hourly horizon — applies to every asset class now that yfinance
# is the primary source across equity/ETF/FX/crypto.
_YFINANCE_HOURLY_MAX_DAYS = 730
_YFINANCE_HOURLY_CLASSES = {
    AssetClass.EQUITY,
    AssetClass.ETF,
    AssetClass.FX,
    AssetClass.CRYPTO,
}
# Daily floor — yfinance returns data from each ticker's listing date
# onward, so any sufficiently old start works. We deliberately avoid
# 1970-01-01 because yfinance treats the Unix epoch as a sentinel for
# "no start" and falls back to a tiny window for crypto symbols. 1971
# pre-dates every tradable security on yfinance.
_DAILY_HISTORY_START = datetime(1971, 1, 1)


def _start_for(asset_class: str, timeframe: str, end: datetime) -> datetime:
    """How far back to fetch for this (asset_class, timeframe).

    Hourly is pushed to one day inside yfinance's 730-day cap (1-day
    safety margin for the request race). Daily uses a 1970 floor so
    yfinance returns each ticker's full listing-date history.
    """
    if timeframe == "1h" and AssetClass(asset_class) in _YFINANCE_HOURLY_CLASSES:
        return end - timedelta(days=_YFINANCE_HOURLY_MAX_DAYS - 1)
    return _DAILY_HISTORY_START


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
        end = utcnow()

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
