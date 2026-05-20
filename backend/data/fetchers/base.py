"""BaseFetcher — abstract base class for all market-data fetchers.

Every concrete fetcher (yfinance, ccxt/Binance, Stooq, …) returns a DataFrame
with the same shape and dtypes so downstream code (cleaner, DB layer) doesn't
care where bars came from.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import ClassVar

import pandas as pd
import structlog
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from backend.config import settings


# The canonical OHLCV column order. All fetchers must produce these columns
# (lowercase) in this order, indexed by a tz-naive UTC ``DatetimeIndex``.
OHLCV_COLUMNS: list[str] = ["open", "high", "low", "close", "volume"]


log = structlog.get_logger(__name__)


class FetcherError(RuntimeError):
    """Raised when a fetcher cannot retrieve data after retries."""


class BaseFetcher(ABC):
    """Abstract base class. Subclasses implement ``_fetch_raw``."""

    source_name: ClassVar[str] = "abstract"

    # ------------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------------
    def fetch(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        """Fetch historical OHLCV bars between [start, end] inclusive.

        Returns a DataFrame in canonical form. Wraps the subclass's
        ``_fetch_raw`` with retry/backoff and result-shape validation.
        """
        log.info(
            "fetcher.start",
            source=self.source_name,
            symbol=symbol,
            start=start.isoformat(),
            end=end.isoformat(),
            timeframe=timeframe,
        )

        df = self._fetch_with_retries(symbol, start, end, timeframe)
        df = self._normalize(df, timeframe)
        self._validate_shape(df, symbol)

        log.info(
            "fetcher.done",
            source=self.source_name,
            symbol=symbol,
            rows=len(df),
            timeframe=timeframe,
        )
        return df

    # ------------------------------------------------------------------------
    # Subclass hooks
    # ------------------------------------------------------------------------
    @abstractmethod
    def _fetch_raw(
        self, symbol: str, start: datetime, end: datetime, timeframe: str = "1d"
    ) -> pd.DataFrame:
        """Hit the external API. Return a DataFrame with at least the OHLCV
        columns; column names may differ from the canonical form (we
        normalise in ``_normalize``)."""

    # ------------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------------
    def _fetch_with_retries(
        self, symbol: str, start: datetime, end: datetime, timeframe: str = "1d"
    ) -> pd.DataFrame:
        """Wrap ``_fetch_raw`` with exponential-backoff retries.

        We retry on any ``Exception`` other than ``FetcherError`` (which is
        the deliberate "give up" signal). External APIs flake; retries are
        the cheapest fix.
        """

        @retry(
            stop=stop_after_attempt(settings.data_fetch_retry_max),
            wait=wait_exponential(multiplier=settings.data_fetch_retry_backoff_s, min=1, max=30),
            retry=retry_if_exception(lambda e: not isinstance(e, FetcherError)),
            reraise=True,
        )
        def _go() -> pd.DataFrame:
            return self._fetch_raw(symbol, start, end, timeframe)

        try:
            return _go()
        except Exception as e:
            log.error(
                "fetcher.give_up",
                source=self.source_name,
                symbol=symbol,
                error=str(e),
            )
            raise FetcherError(f"{self.source_name} failed for {symbol}: {e}") from e

    def _normalize(self, df: pd.DataFrame, timeframe: str = "1d") -> pd.DataFrame:
        """Bring whatever the upstream API returned into canonical shape:

        * Lowercase column names.
        * Keep only the canonical OHLCV columns.
        * Tz-naive UTC ``DatetimeIndex``, sorted ascending, no dupes.
        * Float64 dtype.
        * For daily bars, floor the index to midnight UTC so it aligns
          with daily calendars. For intraday bars, keep the source's
          original timestamps (yfinance NYSE hourly returns 09:30, 10:30,
          … ET → 14:30, 15:30, … UTC; Binance/yfinance crypto+FX hourly
          return whole UTC hours).
        """
        if df.empty:
            return pd.DataFrame(columns=OHLCV_COLUMNS, index=pd.DatetimeIndex([], name="ts"))

        df = df.copy()
        df.columns = [c.lower() for c in df.columns]

        missing = [c for c in OHLCV_COLUMNS if c not in df.columns]
        if missing:
            raise FetcherError(f"missing required columns {missing} (got {list(df.columns)})")

        df = df[OHLCV_COLUMNS].astype("float64")
        # Clamp high/low to be OHLC-consistent (Yahoo FX sometimes reports high < open)
        price_cols = df[["open", "close"]]
        df["high"] = df[["high"]].join(price_cols).max(axis=1)
        df["low"] = df[["low"]].join(price_cols).min(axis=1)

        if df.index.tz is not None:
            df.index = df.index.tz_convert("UTC").tz_localize(None)
        if timeframe == "1d":
            df.index = df.index.normalize()  # floor to midnight for daily alignment
        # else: leave intraday timestamps alone (already tz-naive UTC).
        df.index.name = "ts"
        df = df.sort_index()
        df = df[~df.index.duplicated(keep="last")]
        return df

    def _validate_shape(self, df: pd.DataFrame, symbol: str) -> None:
        """Sanity checks beyond shape — catch obviously-bad data here so it
        never reaches the cleaner or the DB."""
        if df.empty:
            log.warning("fetcher.empty", source=self.source_name, symbol=symbol)
            return
        # Negative or zero prices are a fast no-go.
        if (df[["open", "high", "low", "close"]] <= 0).any().any():
            raise FetcherError(f"non-positive price detected for {symbol}")
        # high >= max(open, close, low); allow 0.01% floating-point tolerance
        tol = df["close"] * 1e-4
        if (df["high"] < df[["open", "close", "low"]].max(axis=1) - tol).any():
            raise FetcherError(f"inconsistent high column for {symbol}")
        if (df["low"] > df[["open", "close", "high"]].min(axis=1) + tol).any():
            raise FetcherError(f"inconsistent low column for {symbol}")
