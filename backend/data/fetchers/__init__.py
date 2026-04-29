"""Fetcher subpackage. One module per data source."""

from backend.data.fetchers.base import BaseFetcher, OHLCV_COLUMNS
from backend.data.fetchers.crypto_fetcher import CryptoFetcher
from backend.data.fetchers.equity_fetcher import EquityFetcher
from backend.data.fetchers.fx_fetcher import FXFetcher

__all__ = [
    "BaseFetcher",
    "CryptoFetcher",
    "EquityFetcher",
    "FXFetcher",
    "OHLCV_COLUMNS",
]
