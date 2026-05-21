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
    # Equities — US mega-caps across tech, financials, healthcare, consumer, energy, industrials
    {"symbol": "AAPL", "asset_class": AssetClass.EQUITY, "name": "Apple Inc.", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "NVDA", "asset_class": AssetClass.EQUITY, "name": "NVIDIA Corporation", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "MSFT", "asset_class": AssetClass.EQUITY, "name": "Microsoft Corporation", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "TSLA", "asset_class": AssetClass.EQUITY, "name": "Tesla, Inc.", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "GOOGL", "asset_class": AssetClass.EQUITY, "name": "Alphabet Inc.", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "AMZN", "asset_class": AssetClass.EQUITY, "name": "Amazon.com, Inc.", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "META", "asset_class": AssetClass.EQUITY, "name": "Meta Platforms, Inc.", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "JPM", "asset_class": AssetClass.EQUITY, "name": "JPMorgan Chase & Co.", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "V", "asset_class": AssetClass.EQUITY, "name": "Visa Inc.", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "JNJ", "asset_class": AssetClass.EQUITY, "name": "Johnson & Johnson", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "UNH", "asset_class": AssetClass.EQUITY, "name": "UnitedHealth Group Inc.", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "LLY", "asset_class": AssetClass.EQUITY, "name": "Eli Lilly and Company", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "WMT", "asset_class": AssetClass.EQUITY, "name": "Walmart Inc.", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "KO", "asset_class": AssetClass.EQUITY, "name": "The Coca-Cola Company", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "PG", "asset_class": AssetClass.EQUITY, "name": "The Procter & Gamble Company", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "HD", "asset_class": AssetClass.EQUITY, "name": "The Home Depot, Inc.", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "XOM", "asset_class": AssetClass.EQUITY, "name": "Exxon Mobil Corporation", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "CAT", "asset_class": AssetClass.EQUITY, "name": "Caterpillar Inc.", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "BA", "asset_class": AssetClass.EQUITY, "name": "The Boeing Company", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "DIS", "asset_class": AssetClass.EQUITY, "name": "The Walt Disney Company", "exchange": "NYSE", "currency": "USD"},
    # ETFs — broad market, tech, small-cap, long-duration treasuries, gold
    {"symbol": "SPY", "asset_class": AssetClass.ETF, "name": "SPDR S&P 500 ETF", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "QQQ", "asset_class": AssetClass.ETF, "name": "Invesco QQQ Trust", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "IWM", "asset_class": AssetClass.ETF, "name": "iShares Russell 2000 ETF", "exchange": "NYSE", "currency": "USD"},
    {"symbol": "TLT", "asset_class": AssetClass.ETF, "name": "iShares 20+ Year Treasury Bond ETF", "exchange": "NASDAQ", "currency": "USD"},
    {"symbol": "GLD", "asset_class": AssetClass.ETF, "name": "SPDR Gold Shares", "exchange": "NYSE", "currency": "USD"},
    # Crypto (yfinance form) — top-5 by market cap
    {"symbol": "BTC-USD", "asset_class": AssetClass.CRYPTO, "name": "Bitcoin", "exchange": "yfinance", "currency": "USD"},
    {"symbol": "ETH-USD", "asset_class": AssetClass.CRYPTO, "name": "Ethereum", "exchange": "yfinance", "currency": "USD"},
    {"symbol": "BNB-USD", "asset_class": AssetClass.CRYPTO, "name": "BNB", "exchange": "yfinance", "currency": "USD"},
    {"symbol": "XRP-USD", "asset_class": AssetClass.CRYPTO, "name": "XRP", "exchange": "yfinance", "currency": "USD"},
    {"symbol": "SOL-USD", "asset_class": AssetClass.CRYPTO, "name": "Solana", "exchange": "yfinance", "currency": "USD"},
    # FX (yfinance form) — USD / EUR / GBP / CHF crosses
    {"symbol": "EURUSD=X", "asset_class": AssetClass.FX, "name": "EUR / USD", "exchange": "OTC", "currency": "USD"},
    {"symbol": "GBPUSD=X", "asset_class": AssetClass.FX, "name": "GBP / USD", "exchange": "OTC", "currency": "USD"},
    {"symbol": "USDCHF=X", "asset_class": AssetClass.FX, "name": "USD / CHF", "exchange": "OTC", "currency": "CHF"},
    {"symbol": "EURCHF=X", "asset_class": AssetClass.FX, "name": "EUR / CHF", "exchange": "OTC", "currency": "CHF"},
    {"symbol": "EURGBP=X", "asset_class": AssetClass.FX, "name": "EUR / GBP", "exchange": "OTC", "currency": "GBP"},
    {"symbol": "GBPCHF=X", "asset_class": AssetClass.FX, "name": "GBP / CHF", "exchange": "OTC", "currency": "CHF"},
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
