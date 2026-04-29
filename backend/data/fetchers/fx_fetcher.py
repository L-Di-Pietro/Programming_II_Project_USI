"""FXFetcher — pulls FX OHLCV.

Two-source strategy
-------------------
1. **Primary: yfinance** — Yahoo carries FX pairs as ``EURUSD=X``, ``GBPUSD=X``,
   etc. Free, daily granularity, decade+ history.
2. **Fallback: Stooq** via ``pandas-datareader`` — Stooq has long FX history
   (sometimes back to the 1990s) and is unrelated to Yahoo, so a Yahoo
   outage doesn't kill the fetch.

Symbol convention
-----------------
We use the yfinance form (``EURUSD=X``). The Stooq fallback strips the
``=X`` and translates to Stooq's lowercased pair format.
"""

from __future__ import annotations

from datetime import datetime
from typing import ClassVar

import pandas as pd
import yfinance as yf
from pandas_datareader import data as pdr

from backend.data.fetchers.base import BaseFetcher, FetcherError


class FXFetcher(BaseFetcher):
    source_name: ClassVar[str] = "yfinance+stooq"

    def _fetch_raw(self, symbol: str, start: datetime, end: datetime) -> pd.DataFrame:
        try:
            return self._fetch_yfinance(symbol, start, end)
        except Exception as primary_error:
            try:
                return self._fetch_stooq(symbol, start, end)
            except Exception as fallback_error:
                raise FetcherError(
                    f"Both yfinance and Stooq failed for {symbol}. "
                    f"primary={primary_error}; fallback={fallback_error}"
                ) from fallback_error

    # ------------------------------------------------------------------------
    # yfinance (primary)
    # ------------------------------------------------------------------------
    def _fetch_yfinance(self, symbol: str, start: datetime, end: datetime) -> pd.DataFrame:
        ticker = yf.Ticker(symbol)
        df = ticker.history(
            start=start.strftime("%Y-%m-%d"),
            end=(end + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
            interval="1d",
            auto_adjust=False,
        )
        if df is None or df.empty:
            return pd.DataFrame()
        return df

    # ------------------------------------------------------------------------
    # Stooq (fallback)
    # ------------------------------------------------------------------------
    def _fetch_stooq(self, symbol: str, start: datetime, end: datetime) -> pd.DataFrame:
        # Yahoo "EURUSD=X" → Stooq "eurusd"
        stooq_symbol = symbol.replace("=X", "").lower()
        df = pdr.DataReader(stooq_symbol, "stooq", start, end)
        if df is None or df.empty:
            return pd.DataFrame()
        # Stooq returns descending; sort ascending for canonical form.
        return df.sort_index()
