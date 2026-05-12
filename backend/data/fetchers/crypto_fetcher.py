"""CryptoFetcher — pulls crypto OHLCV.

Two-source strategy
-------------------
1. **CoinGecko** — public API, no key required, generous rate limit for
   daily data. Endpoint: ``/coins/{id}/market_chart`` returns price /
   volume series. CoinGecko does NOT expose OHLC for free over arbitrary
   ranges, so we resample their close-price series. **Daily only** — for
   hourly requests we skip CoinGecko entirely.
2. **ccxt → Binance** — true OHLCV candles, multi-year history at hourly
   granularity. Primary source for hourly requests; daily fallback.

Symbol convention
-----------------
Use **CoinGecko IDs** as the canonical symbol (``bitcoin``, ``ethereum``,
…). The Binance path maps these to Binance pairs (``BTC/USDT``, ``ETH/USDT``).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import ClassVar

import ccxt
import pandas as pd
import requests

from backend.data.fetchers.base import BaseFetcher, FetcherError


# CoinGecko id  → Binance trading pair fallback.
_COINGECKO_TO_BINANCE: dict[str, str] = {
    "bitcoin": "BTC/USDT",
    "ethereum": "ETH/USDT",
    "solana": "SOL/USDT",
}

# Milliseconds per bar — used to advance ccxt's paging cursor.
_STRIDE_MS: dict[str, int] = {
    "1d": 86_400_000,
    "1h": 3_600_000,
}


class CryptoFetcher(BaseFetcher):
    source_name: ClassVar[str] = "coingecko+ccxt"

    _COINGECKO_BASE = "https://api.coingecko.com/api/v3"

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
        # Hourly skips CoinGecko entirely — its free tier doesn't expose
        # clean hourly OHLCV. Go straight to Binance.
        if timeframe == "1h":
            return self._fetch_binance(symbol, start, end, timeframe)

        try:
            return self._fetch_coingecko(symbol, start, end)
        except Exception as primary_error:
            try:
                return self._fetch_binance(symbol, start, end, timeframe)
            except Exception as fallback_error:
                raise FetcherError(
                    f"Both CoinGecko and Binance failed for {symbol}. "
                    f"primary={primary_error}; fallback={fallback_error}"
                ) from fallback_error

    # ------------------------------------------------------------------------
    # CoinGecko (daily only)
    # ------------------------------------------------------------------------
    def _fetch_coingecko(self, symbol: str, start: datetime, end: datetime) -> pd.DataFrame:
        """CoinGecko ``market_chart/range`` returns three series — prices,
        market_caps, total_volumes — each as ``[ts_ms, value]`` pairs.

        We get the *closing price* per day (CoinGecko's series at the daily
        granularity is one snapshot per UTC day) and reconstruct OHLCV by
        building open=high=low=close=that price. This is a compromise: real
        intra-day OHLC is not exposed without a paid plan.
        """
        url = f"{self._COINGECKO_BASE}/coins/{symbol}/market_chart/range"
        params = {
            "vs_currency": "usd",
            "from": int(start.replace(tzinfo=timezone.utc).timestamp()),
            "to": int(end.replace(tzinfo=timezone.utc).timestamp()),
        }
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
        payload = response.json()

        prices = payload.get("prices", [])
        volumes = payload.get("total_volumes", [])
        if not prices:
            return pd.DataFrame()

        df_prices = pd.DataFrame(prices, columns=["ts_ms", "close"])
        df_volumes = pd.DataFrame(volumes, columns=["ts_ms", "volume"])
        df = df_prices.merge(df_volumes, on="ts_ms", how="left")
        df["ts"] = pd.to_datetime(df["ts_ms"], unit="ms", utc=True).dt.tz_convert("UTC").dt.tz_localize(None)
        df = df.set_index("ts").drop(columns=["ts_ms"])
        # Resample to daily — CoinGecko already returns daily for >90d ranges,
        # but we explicitly resample to be safe and deterministic.
        df = df.resample("1D").agg({"close": "last", "volume": "sum"}).dropna(subset=["close"])
        # Fabricate OHLC from the close. Honest: this is a known limitation.
        df["open"] = df["close"]
        df["high"] = df["close"]
        df["low"] = df["close"]
        df["volume"] = df["volume"].fillna(0.0)
        return df[["open", "high", "low", "close", "volume"]]

    # ------------------------------------------------------------------------
    # Binance via ccxt — gives real OHLCV candles
    # ------------------------------------------------------------------------
    def _fetch_binance(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        pair = _COINGECKO_TO_BINANCE.get(symbol)
        if pair is None:
            raise FetcherError(
                f"No Binance pair mapping for symbol {symbol!r}. "
                f"Add it to _COINGECKO_TO_BINANCE."
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
