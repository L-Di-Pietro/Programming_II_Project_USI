"""Data ingestion package — fetchers + cleaner.

The fetchers normalise external APIs into a uniform OHLCV DataFrame; the
cleaner validates and aligns those frames to a common business-day calendar
before they hit the database.
"""

from backend.data.cleaner import OHLCVCleaner
from backend.data.fetchers.base import BaseFetcher
from backend.data.fetchers.crypto_fetcher import CryptoFetcher
from backend.data.fetchers.equity_fetcher import EquityFetcher
from backend.data.fetchers.fx_fetcher import FXFetcher

__all__ = [
    "BaseFetcher",
    "CryptoFetcher",
    "EquityFetcher",
    "FXFetcher",
    "OHLCVCleaner",
]
