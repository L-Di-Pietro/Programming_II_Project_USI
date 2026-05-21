"""CryptoFetcher — pulls crypto OHLCV.

Two-source strategy
-------------------
1. **Primary: yfinance** — Yahoo carries crypto pairs as ``BTC-USD``,
   ``ETH-USD``, ``SOL-USD``, etc. Free, real OHLC, deep daily history;
   hourly limited to ~730 days back.
2. **Fallback: ccxt → Binance** — true OHLCV candles, multi-year history
   at hourly granularity. Used whenever yfinance fails (API hiccup, the
   730-day hourly cap, regional issues, etc.).

Timeframes
----------
* ``1d`` — yfinance primary, Binance fallback.
* ``1h`` — yfinance primary (capped at ~730 days), Binance fallback for
  older history.

Symbol convention
-----------------
We use the yfinance form (``BTC-USD``). The Binance fallback maps these
to Binance trading pairs (``BTC/USDT``, ``ETH/USDT``, …).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import ClassVar

import ccxt
import pandas as pd
import yfinance as yf

from backend.data.fetchers.base import BaseFetcher, FetcherError


_YF_INTERVAL: dict[str, str] = {"1d": "1d", "1h": "1h"}
_YF_HOURLY_MAX_DAYS: int = 730


# yfinance crypto symbol → Binance trading pair fallback.
_YFINANCE_TO_BINANCE: dict[str, str] = {
    "BTC-USD": "BTC/USDT",
    "ETH-USD": "ETH/USDT",
    "BNB-USD": "BNB/USDT",
    "XRP-USD": "XRP/USDT",
    "SOL-USD": "SOL/USDT",
}

# Milliseconds per bar — used to advance ccxt's paging cursor.
_STRIDE_MS: dict[str, int] = {
    "1d": 86_400_000,
    "1h": 3_600_000,
}


class CryptoFetcher(BaseFetcher):
    source_name: ClassVar[str] = "yfinance+ccxt"

    # ------------------------------------------------------------------------
    # Public override
    # ------------------------------------------------------------------------
    def _fetch_raw(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        if timeframe not in _STRIDE_MS:
            raise FetcherError(
                f"CryptoFetcher does not support timeframe={timeframe!r}"
            )
        try:
            return self._fetch_yfinance(symbol, start, end, timeframe)
        except Exception as primary_error:
            try:
                return self._fetch_binance(symbol, start, end, timeframe)
            except Exception as fallback_error:
                raise FetcherError(
                    f"Both yfinance and Binance failed for {symbol}. "
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
            actions=False,
        )
        if df is None or df.empty:
            return pd.DataFrame()
        return df

    # ------------------------------------------------------------------------
    # Binance via ccxt (fallback) — gives real OHLCV candles
    # ------------------------------------------------------------------------
    def _fetch_binance(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        pair = _YFINANCE_TO_BINANCE.get(symbol)
        if pair is None:
            raise FetcherError(
                f"No Binance pair mapping for symbol {symbol!r}. "
                f"Add it to _YFINANCE_TO_BINANCE."
            )

        stride_ms = _STRIDE_MS[timeframe]
        exchange = ccxt.binance({"enableRateLimit": True})
        since = int(start.replace(tzinfo=timezone.utc).timestamp() * 1000)
        end_ms = int(end.replace(tzinfo=timezone.utc).timestamp() * 1000)

        # ccxt fetch_ohlcv pages 1000 candles at a time — loop until we cover
        # the requested range.
        all_candles: list[list[float]] = []
        cursor = since
        while True:
            candles = exchange.fetch_ohlcv(pair, timeframe=timeframe, since=cursor, limit=1000)
            if not candles:
                break
            all_candles.extend(candles)
            last_ts = candles[-1][0]
            if last_ts >= end_ms or len(candles) < 1000:
                break
            cursor = last_ts + stride_ms

        if not all_candles:
            return pd.DataFrame()

        df = pd.DataFrame(all_candles, columns=["ts_ms", "open", "high", "low", "close", "volume"])
        df["ts"] = pd.to_datetime(df["ts_ms"], unit="ms", utc=True).dt.tz_convert("UTC").dt.tz_localize(None)
        return df.set_index("ts").drop(columns=["ts_ms"])
