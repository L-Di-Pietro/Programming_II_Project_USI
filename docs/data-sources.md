# Data sources

This document describes each data provider used by the Data Agent, its
quirks, and the fallback chain.

## yfinance (Yahoo Finance)

**Used for:** equities, ETFs, FX (`EURUSD=X` form).

**Pros:** free, no API key, broad coverage, deep history (1970s+ for major
US tickers), auto-adjusts for splits and dividends.

**Cons:**
- Survivorship bias — Yahoo only carries currently-listed tickers. Backtests
  on a fixed universe over-state historical returns.
- Occasionally rate-limited under heavy use. Mitigated by retries with
  exponential backoff (see `BaseFetcher`).
- API breakage — Yahoo changes their frontend periodically; the maintainers
  patch yfinance fast but expect occasional release upgrades.

**Settings used:** `auto_adjust=True` for equities (so `close` is split- and
dividend-adjusted); `auto_adjust=False` for FX (no corporate actions to
adjust for).

## CoinGecko

**Used for:** crypto (default for BTC).

**Pros:** free public API, no key required, generous rate limits for daily
data.

**Cons:**
- Free tier returns daily prices but not OHLC over arbitrary date ranges —
  we synthesise OHLC from the close price (open=high=low=close on each
  day). This is a known limitation; serious users would point at the Pro
  tier.
- Symbol convention is CoinGecko ids (`bitcoin`, `ethereum`, …), not
  exchange tickers.

**Endpoint:** `GET /coins/{id}/market_chart/range`.

## ccxt + Binance

**Used for:** crypto fallback when CoinGecko is unavailable.

**Pros:** real OHLC candles, very high rate limits, daily granularity.

**Cons:**
- Binance lists by trading pair (`BTC/USDT`), not coin id. We maintain a
  mapping in `backend/data/fetchers/crypto_fetcher.py`.
- `fetch_ohlcv` is paginated at 1000 candles per call; we loop until
  the requested range is covered.

## Stooq (via pandas-datareader)

**Used for:** FX fallback when yfinance is unavailable.

**Pros:** unrelated to Yahoo, very long FX history (back to the 1990s for
major pairs), no key.

**Cons:**
- Only EOD data, no intraday.
- Returns descending order (we sort).

## Calendar standardization

We standardize on the **NYSE business-day** calendar (`exchange_calendars`
package, `XNYS`). Cross-asset backtests therefore align:

- Equities → trading days only (already on this calendar).
- Crypto → forward-fill weekends to the prior Friday close.
- FX → forward-fill any holiday gaps.

This is a simplification. For intraday or pure-crypto backtests, set the
`calendar` argument on `OHLCVCleaner` to `"24x7"`.

## Adding a new data source

1. Subclass `BaseFetcher` in `backend/data/fetchers/<your_fetcher>.py`.
2. Implement `_fetch_raw(symbol, start, end) -> DataFrame` with at least
   `open, high, low, close, volume`.
3. Register the fetcher in `DataAgent._FETCHERS`.
4. Document its quirks in this file.
