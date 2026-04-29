"""EquityFetcher — pulls equity / ETF OHLCV from Yahoo Finance via yfinance.

Why yfinance
------------
Free, broad coverage, deep history (back to 1970s for major US tickers),
auto-adjusted for splits and dividends. The Pythonic API hides Yahoo's REST
quirks. Limitations: rate-limiting under heavy use, no delisted tickers
(survivorship bias — documented in README).

Behaviour
---------
* Returns adjusted-close prices (so split / dividend adjustments are
  retroactive across the whole series).
* Drops the ``Adj Close`` and ``Dividends`` / ``Stock Splits`` columns;
  ``close`` already reflects adjustments.
"""

from __future__ import annotations

from datetime import datetime
from typing import ClassVar

import pandas as pd
import yfinance as yf

from backend.data.fetchers.base import BaseFetcher


class EquityFetcher(BaseFetcher):
    source_name: ClassVar[str] = "yfinance"

    def _fetch_raw(self, symbol: str, start: datetime, end: datetime) -> pd.DataFrame:
        # auto_adjust=True → 'Close' is split- and dividend-adjusted. We use
        # this as our canonical 'close' (and drop the non-adjusted columns).
        ticker = yf.Ticker(symbol)
        df = ticker.history(
            start=start.strftime("%Y-%m-%d"),
            end=(end + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),  # yfinance end is exclusive
            interval="1d",
            auto_adjust=True,
            actions=False,  # we don't need dividend / split rows
        )
        if df is None or df.empty:
            return pd.DataFrame()
        # yfinance returns columns: Open, High, Low, Close, Volume.
        # The base class lowercases and validates.
        return df
