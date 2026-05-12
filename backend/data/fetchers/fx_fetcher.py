"""FXFetcher — pulls FX OHLCV.

Two-source strategy (daily only)
--------------------------------
1. **Primary: yfinance** — Yahoo carries FX pairs as ``EURUSD=X``, ``GBPUSD=X``,
   etc. Free, decade+ daily history; hourly limited to ~730 days back.
2. **Fallback: Stooq** via ``pandas-datareader`` — Stooq has long FX history
   (sometimes back to the 1990s) and is unrelated to Yahoo, so a Yahoo
   outage doesn't kill the daily fetch. **Stooq is EOD only** — it cannot
   serve as a fallback for hourly requests.

Timeframes
----------
* ``1d`` — yfinance primary, Stooq fallback.
* ``1h`` — yfinance only. Capped at ~730 days of history (yfinance limit).

Symbol convention
-----------------
We use the yfinance form (``EURUSD=X``). The Stooq fallback strips the
``=X`` and translates to Stooq's lowercased pair format.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import ClassVar

import pandas as pd
import yfinance as yf
from pandas_datareader import data as pdr

from backend.data.fetchers.base import BaseFetcher, FetcherError

_YF_INTERVAL: dict[str, str] = {"1d": "1d", "1h": "1h"}
_YF_HOURLY_MAX_DAYS: int = 730


class FXFetcher(BaseFetcher):
    source_name: ClassVar[str] = "yfinance+stooq"

    def _fetch_raw(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        if timeframe not in _YF_INTERVAL:
            raise FetcherError(
                f"FXFetcher does not support timeframe={timeframe!r}"
            )
        try:
            return self._fetch_yfinance(symbol, start, end, timeframe)
        except Exception as primary_error:
            if timeframe != "1d":
                # Stooq has no intraday — re-raise the yfinance error so the
                # caller sees the real cause (typically the 730-day cap or
                # an API hiccup), rather than a misleading "both failed".
                raise
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
    def _fetch_yfinance(
        self, symbol: str, start: datetime, end: datetime, timeframe: str
    ) -> pd.DataFrame:
        interval = _YF_INTERVAL[timeframe]
        if timeframe == "1h":
            age_days = (datetime.utcnow() - start).days
            if age_days > _YF_HOURLY_MAX_DAYS:
                raise FetcherError(
                    f"yfinance hourly history is limited to {_YF_HOURLY_MAX_DAYS} days; "
                    f"requested start={start.date()} is {age_days} days old"
                )

        ticker = yf.Ticker(symbol)
        df = ticker.history(
            start=start.strftime("%Y-%m-%d"),
            end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),
            interval=interval,
            auto_adjust=False,
        )
        if df is None or df.empty:
            return pd.DataFrame()
        return df

    # ------------------------------------------------------------------------
    # Stooq (fallback) — daily only
    # ------------------------------------------------------------------------
    def _fetch_stooq(self, symbol: str, start: datetime, end: datetime) -> pd.DataFrame:
        # Yahoo "EURUSD=X" → Stooq "eurusd"
        stooq_symbol = symbol.replace("=X", "").lower()
        df = pdr.DataReader(stooq_symbol, "stooq", start, end)
        if df is None or df.empty:
            return pd.DataFrame()
        # Stooq returns descending; sort ascending for canonical form.
        return df.sort_index()
