"""One-shot bulk data fetch: hydrates the local DB with ~10y of history for
every seeded asset.

Run **after** ``init_db.py``:

    python scripts/load_initial_data.py

Subsequent updates are handled by the nightly APScheduler job started inside
``backend.main``.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog

from backend.agents.data_agent import DataAgent, DataAgentInput
from backend.config import configure_logging
from backend.database.connection import SessionLocal
from backend.database.models import Asset

log = structlog.get_logger(__name__)


def main() -> None:
    configure_logging()
    log.info("bulk_load.start")
    db = SessionLocal()
    try:
        agent = DataAgent(db)
        end = datetime.utcnow()
        start = end - timedelta(days=365 * 10)

        for asset in db.query(Asset).filter_by(is_active=True).all():
            try:
                result = agent.run(
                    DataAgentInput(
                        op="refresh",
                        symbol=asset.symbol,
                        start=start,
                        end=end,
                    )
                )
                log.info(
                    "bulk_load.asset_done",
                    symbol=asset.symbol,
                    rows=result.rows_written,
                    last_ts=result.last_ts.isoformat() if result.last_ts else None,
                )
            except Exception:  # one bad asset shouldn't stop the others
                log.exception("bulk_load.asset_failed", symbol=asset.symbol)
    finally:
        db.close()
    log.info("bulk_load.done")


if __name__ == "__main__":
    main()
