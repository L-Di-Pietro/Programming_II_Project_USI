# Trading calendars

Every cleaned OHLCV frame is reindexed onto a target calendar inside
`OHLCVCleaner._reindex_to_calendar`. The calendar is determined by the
asset class; the timeframe selects daily vs. hourly resolution.

| Asset class  | Calendar choice | Daily index            | Hourly index                          |
|--------------|-----------------|------------------------|---------------------------------------|
| Equity / ETF | `"nyse"`        | NYSE sessions (XNYS)    | 09:30–15:30 ET inside each session    |
| FX           | `"24x5"`        | `pd.bdate_range` (Mon–Fri) | Sun 22:00 UTC → Fri 22:00 UTC      |
| Crypto       | `"24x7"`        | every UTC day           | every UTC hour                        |

All indexes are tz-naive UTC.

## NYSE (`"nyse"`)

### Daily
`exchange_calendars.get_calendar("XNYS").sessions_in_range(start, end)`.
Excludes weekends and US public holidays. ~252 sessions/year.

### Hourly
For each session, build:

```python
pd.date_range(open_ts, close_ts, freq="1h", inclusive="left")
```

`schedule()` exposes the session's tz-aware UTC `open` and `close`. For a
regular session (09:30–16:00 ET = 14:30–21:00 UTC in winter, 13:30–20:00
UTC in summer), this yields 7 hourly stamps at half-past hours (14:30,
15:30, …, 20:30 UTC).

Early-close sessions (~10 per year, e.g. day after Thanksgiving) close at
13:00 ET; `schedule()` reflects this and the same algorithm yields 4
stamps instead of 7 — no special-casing required.

**Annualization factor:** 252 × 6.5 = **1638** hourly bars per year.
The 6.5 is elapsed market hours per session; this is the standard
equity-vol convention. A literal bar count (252 × 7 = 1764) differs
because the first bar covers only the 30-minute open auction.

## FX 24×5 (`"24x5"`)

The interbank FX market trades continuously from **Sunday 22:00 UTC**
(Sydney open) through **Friday 22:00 UTC** (New York close).

### Daily
`pd.bdate_range(start, end)` — Monday through Friday only. ~260
bars/year. (We do not subtract banking holidays — FX trades through most
US/UK equity holidays.)

### Hourly
Build the full hourly grid and drop the closed window:

```python
idx    = pd.date_range(start, end, freq="h")
dow    = idx.dayofweek           # Mon=0 … Sun=6
hr     = idx.hour
closed = ((dow == 4) & (hr >= 22)) | (dow == 5) | ((dow == 6) & (hr < 22))
idx    = idx[~closed]
```

The closed window in UTC is `Fri 22:00 (inclusive) → Sun 22:00 (exclusive)`.

**Annualization factor:** 260 × 24 = **6240** hourly bars per year.

## Crypto 24×7 (`"24x7"`)

Always-on. No closures.

### Daily
`pd.date_range(start, end, freq="D")`. **365** bars/year.

### Hourly
`pd.date_range(start, end, freq="h")`. **8760** bars/year.

Binance via ccxt serves crypto hourly back to each pair's listing date
(BTC ~2017, ETH ~2018, SOL ~2020), so the 730-day yfinance cap that
applies to equity/ETF/FX does **not** apply to crypto hourly.

## Bounded forward-fill

After reindexing, NaN cells may appear where the source lacked a bar
that the target calendar requires. The cleaner applies a **bounded**
forward-fill — only NaN runs of length ≤ 2 are filled, and `volume` on
filled rows is set to 0 (no traded volume on a carried bar). Longer
outages are left as NaN and counted in `CleaningReport.gaps_remaining`
for human investigation, then dropped from the final frame.

This policy distinguishes two situations:
- **Calendar mismatch** (e.g., asking for NYSE sessions of a crypto bar
  that doesn't exist) — should not happen now that each asset uses its
  own calendar.
- **Source flakiness** (e.g., Binance missing a single hourly candle) —
  the bounded ffill papers over these.

Set the threshold in `OHLCVCleaner._bounded_ffill(..., max_gap=N)` if
you want a different policy.

## Annualization lookup

Vol, Sharpe, Sortino, and the `VOL_TARGET` sizing mode all need a
"periods per year" factor that depends on **both** the bar timeframe and
the asset class's native calendar. The canonical lookup is
`backend/analytics/periods.py:periods_per_year(timeframe, asset_class)`:

| timeframe / asset_class | equity / etf | fx   | crypto |
|-------------------------|--------------|------|--------|
| `1d`                    | 252          | 260  | 365    |
| `1h`                    | 1638         | 6240 | 8760   |

`1638 = 252 × 6.5` is the industry-standard equity-vol convention
(elapsed market hours per session). A literal bar count
`252 × 7 = 1764` differs because the first NYSE hourly bar only covers
the 30-minute open auction.

---

_Last verified against code: 2026-05-24._
