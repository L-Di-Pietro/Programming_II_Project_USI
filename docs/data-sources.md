# Data sources

This document describes each data provider used by the Data Agent, its
quirks, and the fallback chain.

## Intraday support matrix

| Source         | Daily        | Hourly                     | Notes                                              |
|----------------|--------------|----------------------------|----------------------------------------------------|
| yfinance       | full history | **~730-day cap**           | Yahoo limits intraday history; used for equity & FX |
| Binance (ccxt) | full history | **multi-year (back to ~2017)** | Primary for crypto hourly; daily fallback        |
| CoinGecko      | full history | —                          | Free tier exposes only daily granularity            |
| Stooq          | full history | —                          | EOD only                                            |

The bulk loader (`scripts/load_initial_data.py`) takes this asymmetry
into account: equity/ETF/FX hourly is requested for the last 730 days
only, crypto hourly is requested for the full 10-year window (Binance
returns whatever it has from the listing date onward).

## yfinance (Yahoo Finance)

**Used for:** equities, ETFs, FX (`EURUSD=X` form). Daily and hourly.

**Pros:** free, no API key, broad coverage, deep daily history (1970s+ for
major US tickers), auto-adjusts for splits and dividends.

**Cons:**
- **Hourly history is limited to ~730 days** from today. The fetcher
  raises `FetcherError` if a request's `start` is older than that, and
  the frontend caps the date picker accordingly when Hourly is selected.
- Survivorship bias — Yahoo only carries currently-listed tickers.
- Occasionally rate-limited; mitigated by retries with exponential backoff.
- API breakage — Yahoo changes their frontend periodically; the
  maintainers patch yfinance fast but expect occasional release upgrades.

**Settings used:** `auto_adjust=True` for equities (so `close` is split-
and dividend-adjusted); `auto_adjust=False` for FX (no corporate actions
to adjust for). `interval` is `"1d"` or `"1h"` based on request.

## CoinGecko

**Used for:** crypto, daily timeframe only.

**Pros:** free public API, no key required, generous rate limits for daily
data.

**Cons:**
- Free tier exposes only daily prices, not OHLC over arbitrary ranges —
  we synthesise OHLC by setting open=high=low=close from the daily close.
  This is a known limitation; the Pro tier exposes real OHLC.
- For **hourly** crypto requests, this fetcher is skipped entirely — the
  free CoinGecko API doesn't expose hourly cleanly. We route directly to
  Binance.
- Symbol convention is CoinGecko ids (`bitcoin`, `ethereum`, …), not
  exchange tickers.

**Endpoint:** `GET /coins/{id}/market_chart/range`.

## ccxt + Binance

**Used for:** crypto hourly (primary), crypto daily (fallback after
CoinGecko).

**Pros:** real OHLC candles, very high rate limits, **multi-year hourly
history** for major pairs (BTC ~2017, ETH ~2018, SOL ~2020 — back to
each pair's listing date).

**Cons:**
- Binance lists by trading pair (`BTC/USDT`), not coin id. We maintain a
  mapping in `backend/data/fetchers/crypto_fetcher.py:_COINGECKO_TO_BINANCE`.
- `fetch_ohlcv` is paginated at 1000 candles per call; we loop until
  the requested range is covered. The stride between calls is the
  timeframe (86_400_000 ms for daily, 3_600_000 ms for hourly).
- Regional restrictions: Binance blocks some IP ranges. The fetcher
  surfaces the error rather than silently swallowing it.

## Stooq (via pandas-datareader)

**Used for:** FX daily fallback when yfinance is unavailable.

**Pros:** unrelated to Yahoo, very long FX history (back to the 1990s for
major pairs), no key.

**Cons:**
- **EOD only — cannot serve hourly.** The FX fetcher raises `FetcherError`
  for any non-`"1d"` request without attempting Stooq.
- Returns descending order (we sort).

## Per-asset-class trading calendars

Each asset class is reindexed onto its native trading calendar rather
than a single shared NYSE calendar. See [`calendars.md`](./calendars.md)
for the formal definitions.

| Asset class      | Calendar | Daily bars/year | Hourly bars/year |
|------------------|----------|-----------------|-------------------|
| Equity / ETF     | NYSE (XNYS) | 252           | 1638 (252 × 6.5)  |
| FX               | 24×5 (Sun 22:00 UTC → Fri 22:00 UTC) | 260 | 6240 |
| Crypto           | 24×7        | 365           | 8760              |

Forward-fill is **bounded**: only NaN runs of length ≤ 2 are filled
(volume=0 on filled rows). Longer outages surface in
`CleaningReport.gaps_remaining` and are dropped from the final frame.

## Adding a new data source

1. Subclass `BaseFetcher` in `backend/data/fetchers/<your_fetcher>.py`.
2. Implement `_fetch_raw(symbol, start, end, timeframe="1d") -> DataFrame`
   with at least `open, high, low, close, volume`. If the source does not
   support hourly, raise `FetcherError` when `timeframe != "1d"`.
3. Register the fetcher in `DataAgent._FETCHERS`.
4. If the asset class is new, add its calendar mapping to
   `DataAgent._CALENDAR_FOR` and an entry to
   `backend/analytics/periods._TABLE`.
5. Document its quirks in this file.
