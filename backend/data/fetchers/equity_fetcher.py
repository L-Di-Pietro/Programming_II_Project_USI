"""EquityFetcher — pulls equity / ETF OHLCV from Yahoo Finance via yfinance.

Why yfinance
------------
Free, broad coverage, deep history (back to 1970s for major US tickers),
auto-adjusted for splits and dividends. The Pythonic API hides Yahoo's REST
quirks. Limitations: rate-limiting under heavy use, no delisted tickers
(survivorship bias — documented in README).

Timeframes
----------
* ``1d`` — full history (decades for major tickers).
* ``1h`` — Yahoo limits hourly history to **~730 days** from today.
  Requests with a ``start`` older than that raise ``FetcherError`` so the
  caller gets a clear signal rather than a silent empty frame.

Behaviour
---------
* Returns adjusted-close prices (so split / dividend adjustments are
  retroactive across the whole series).
* Drops the ``Adj Close`` and ``Dividends`` / ``Stock Splits`` columns;
  ``close`` already reflects adjustments.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import ClassVar

import pandas as pd
import yfinance as yf

from backend.data.fetchers.base import BaseFetcher, FetcherError

_YF_INTERVAL: dict[str, str] = {"1d": "1d", "1h": "1h"}
_YF_HOURLY_MAX_DAYS: int = 730


class EquityFetcher(BaseFetcher):
    source_name: ClassVar[str] = "yfinance"

    def _fetch_raw(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        interval = _YF_INTERVAL.get(timeframe)
        if interval is None:
            raise FetcherError(
                f"EquityFetcher does not support timeframe={timeframe!r}"
            )
        if timeframe == "1h":
            age_days = (datetime.utcnow() - start).days
            if age_days > _YF_HOURLY_MAX_DAYS:
                raise FetcherError(
                    f"yfinance hourly history is limited to {_YF_HOURLY_MAX_DAYS} days; "
                    f"requested start={start.date()} is {age_days} days old"
                )

        # auto_adjust=True → 'Close' is split- and dividend-adjusted. We use
        # this as our canonical 'close' (and drop the non-adjusted columns).
        ticker = yf.Ticker(symbol)
        df = ticker.history(
            start=start.strftime("%Y-%m-%d"),
            end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),  # yfinance end is exclusive
            interval=interval,
            auto_adjust=True,
            actions=False,  # we don't need dividend / split rows
        )
        if df is None or df.empty:
            return pd.DataFrame()
        return df
