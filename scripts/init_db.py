"""Initialize the database: create tables and seed the assets + strategies.

Idempotent — safe to re-run. Run once after cloning the repo:

    python scripts/init_db.py
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

# Allow ``python scripts/init_db.py`` from the project root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog

from backend.config import configure_logging
from backend.database import init_db
from backend.database.connection import SessionLocal
from backend.database.models import Asset, AssetClass, Strategy
from backend.strategies import STRATEGY_REGISTRY

log = structlog.get_logger(__name__)


# -----------------------------------------------------------------------------
# Seed data — keep small so tests / CI run fast.
# -----------------------------------------------------------------------------
SEED_ASSETS: list[dict[str, str]] = [
    # Equities (US tech)
    {"symbol": "AAPL", "asset_class": AssetClass.EQUITY, "name": "Apple Inc.", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "NVDA", "asset_class": AssetClass.EQUITY, "name": "NVIDIA Corporation", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "MSFT", "asset_class": AssetClass.EQUITY, "name": "Microsoft Corporation", "exchange": "NASDAQ", "currency": "USD"},
    # ETF (S&P 500)
    {"symbol": "SPY", "asset_class": AssetClass.ETF, "name": "SPDR S&P 500 ETF", "exchange": "NYSE", "currency": "USD"},
    # Crypto (CoinGecko id)
    {"symbol": "bitcoin", "asset_class": AssetClass.CRYPTO, "name": "Bitcoin", "exchange": "coingecko", "currency": "USD"},
    # FX (yfinance form)
    {"symbol": "EURUSD=X", "asset_class": AssetClass.FX, "name": "EUR / USD", "exchange": "OTC", "currency": "USD"},
]


def _seed_assets(db) -> None:
    for spec in SEED_ASSETS:
        existing = db.query(Asset).filter_by(symbol=spec["symbol"], exchange=spec["exchange"]).one_or_none()
        if existing is None:
            db.add(Asset(**spec, is_active=True, created_at=datetime.utcnow()))
    db.commit()


def _seed_strategies(db) -> None:
    for cls in STRATEGY_REGISTRY.values():
        existing = db.query(Strategy).filter_by(slug=cls.slug).one_or_none()
        if existing is None:
            db.add(
                Strategy(
                    slug=cls.slug,
                    name=cls.name,
                    description=cls.description,
                    params_schema=cls.params_schema(),
                    created_at=datetime.utcnow(),
                )
            )
        else:
            # Keep description and schema in sync with code on reruns.
            existing.name = cls.name
            existing.description = cls.description
            existing.params_schema = cls.params_schema()
    db.commit()


def main() -> None:
    configure_logging()
    log.info("init_db.start")
    init_db()
    db = SessionLocal()
    try:
        _seed_assets(db)
        _seed_strategies(db)
    finally:
        db.close()
    log.info("init_db.done")


if __name__ == "__main__":
    main()
