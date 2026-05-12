# Onboarding — QuantBacktest

A web-based backtesting framework for retail quantitative traders. Test
trading strategies on historical equities, FX, and crypto data, see
standard performance metrics and charts, and (in a future iteration) get
plain-language LLM explanations.

This is **Project 2.8** of the USI *Programming II* course — academic
context, built to a production-leaning standard.

---

## Stack

| Layer        | Choice |
|--------------|--------|
| Backend      | Python 3.11+, FastAPI, SQLAlchemy 2.x, Pydantic v2 |
| Database     | SQLite (dev) · Postgres-compatible schema (prod, via `DATABASE_URL`) |
| Frontend     | React 18 · TypeScript · Vite · TailwindCSS · Plotly.js |
| Tests        | pytest (backend) · Vitest (frontend) |
| Data sources | yfinance · CoinGecko · ccxt/Binance · Stooq |
| Scheduler    | APScheduler (nightly data refresh) |
| LLM          | Provider-agnostic; v1 ships `NullProvider`, Gemini adapter scaffolded |

---

## Quick start

```bash
# Backend
pip install -r requirements.txt
python scripts/init_db.py                              # tables + seed assets
python scripts/load_initial_data.py                    # daily, ~10y history
python scripts/load_initial_data.py --timeframes 1d 1h # add hourly too
uvicorn backend.main:app --reload                      # http://127.0.0.1:8000
pytest                                                 # backend tests
pytest tests/test_engine_no_lookahead.py               # the critical guard
ruff check backend/
mypy backend/

# Frontend
cd frontend && npm install
npm run dev                                            # http://127.0.0.1:5173
npm test
npm run build
```

OpenAPI docs at `http://127.0.0.1:8000/docs` once the backend is running.

---

## Architecture at a glance

```
backend/
├── main.py                          FastAPI app factory + lifespan
├── config.py                        Settings (env-driven)
├── api/
│   ├── schemas.py                   ← Pydantic API contract
│   └── routes/                      Backtest, data, strategies, explain
├── agents/                          Six specialized agents (see below)
├── data/
│   ├── fetchers/                    BaseFetcher + one per source
│   └── cleaner.py                   ← Calendar reindex lives here
├── backtest/
│   ├── engine.py                    ← The event loop (look-ahead-bias guard)
│   ├── portfolio.py | execution.py | risk.py
├── analytics/
│   ├── metrics.py                   CAGR, Sharpe, Sortino, …
│   ├── periods.py                   periods_per_year(tf, asset_class)
│   └── visualizations.py            Plotly figure builders
├── strategies/                      base.py + one file per strategy
└── database/
    ├── models.py                    ← The schema (SQLAlchemy)
    └── connection.py

frontend/src/
├── api/client.ts                    Typed Axios client mirroring schemas.py
├── pages/                           Dashboard, NewBacktest, RunResults, Strategies
└── components/                      EquityCurve, DrawdownChart, MetricsPanel, …

tests/                               pytest suite — see "Testing" below
docs/                                Deep-dive: data-sources, calendars, strategies, agents
scripts/                             init_db.py, load_initial_data.py
```

### The six agents (`backend/agents/`)

| Agent          | Role                                                   |
|----------------|--------------------------------------------------------|
| `DataAgent`    | Fetches OHLCV from external sources, runs the cleaner, upserts to DB |
| `BacktestAgent`| Loads bars from DB, builds the strategy, runs the engine, persists results |
| `AnalyticsAgent` | Reads run rows, computes KPIs and chart payloads on demand |
| `StrategyAgent`| Registry + parameter validation for the strategy library |
| `ExplanationAgent` | LLM-backed; `NullProvider` in v1 returns canned text |
| `Orchestrator` | Tool-use loop that the LLM agents call into |

Each agent inherits `BaseAgent[TIn, TOut]` and wraps `_run` with logging,
timing, and uniform error wrapping (`AgentError`).

---

## Two non-negotiable invariants

### 1. Look-ahead bias is a critical bug

**At bar `t`, a strategy seeing `t`'s close cannot place an order that
fills at `t`'s open or close. Orders placed during bar `t` fill at the
**open of bar `t+1`**.

Enforced in `backend/backtest/engine.py`. Asserted by
`tests/test_engine_no_lookahead.py` (daily bars) and
`tests/test_engine_no_lookahead_hourly.py` (hourly bars) — both inject
an "oracle" strategy that sees the future close and verify the engine
still only lets it trade at next-bar open.

Do **not** add a path that bypasses this. If intra-bar fills become a
requirement, that's a separate intraday-microstructure feature — not a
shortcut on the existing fill code.

### 2. Each asset class uses its native trading calendar

The cleaner reindexes onto a calendar that depends on the asset class:

| Asset class    | Calendar | Daily bars/year | Hourly bars/year |
|----------------|----------|-----------------|-------------------|
| Equity / ETF   | NYSE (XNYS) | 252           | 1638 (252 × 6.5)  |
| FX             | 24×5 (Sun 22:00 UTC → Fri 22:00 UTC) | 260 | 6240 |
| Crypto         | 24×7        | 365           | 8760              |

Dispatched in `DataAgent._CALENDAR_FOR`. Built per request inside
`_refresh`, never globally. Bounded forward-fill (≤ 2-bar gaps) handles
rare single-bar outages; longer gaps surface in
`CleaningReport.gaps_remaining` and are dropped.

See `docs/calendars.md` for the formal definitions and the algorithms
that generate each (calendar, timeframe) index.

---

## Multi-timeframe support

The framework supports both daily (`"1d"`) and hourly (`"1h"`) bars.
Each asset can have bars at both resolutions in the DB simultaneously
(composite PK `(asset_id, ts, timeframe)`).

### Data horizons

| Source          | Daily | Hourly                            |
|-----------------|-------|-----------------------------------|
| yfinance (eq/FX)| 10y   | **~730 days** (Yahoo cap)         |
| Binance/ccxt (crypto) | full | **multi-year (BTC ~2017)**  |
| CoinGecko       | full  | —                                 |
| Stooq           | full  | —                                 |

The frontend caps the date picker to today − 730d **only** when both
Hourly and an equity/ETF/FX asset are selected. Crypto hourly is
unconstrained. The backend `EquityFetcher` and `FXFetcher` raise
`FetcherError` for out-of-range hourly requests, which the API
translates to HTTP 400.

### Annualization

Vol/Sharpe/Sortino and the VOL_TARGET sizing scale via
`backend.analytics.periods.periods_per_year(timeframe, asset_class)`.
The lookup is canonical: 252 × 6.5 = 1638 for hourly equity (elapsed
market hours per year), 8760 for hourly crypto (24 × 365), etc.

---

## OHLCV DataFrame contract

Every internal DataFrame of bars:

- Columns `open, high, low, close, volume`, all `float64`.
- Index is **timezone-naive UTC** `DatetimeIndex`.
- Daily timeframe: index at midnight UTC.
- Hourly timeframe: NYSE bars at half-past hours (14:30 UTC in winter,
  …, 20:30 UTC); crypto/FX bars at whole UTC hours.
- Sorted ascending, no duplicates.
- Missing values may exist after cleaning only if the source had a long
  outage (> 2 consecutive bars); those surface in
  `CleaningReport.gaps_remaining` and are then dropped.

## Strategy signal contract

`generate_signals(bars) → pd.Series[int]` with values in `{-1, 0, 1}`,
aligned to the input index. `+1` = target long, `0` = flat, `-1` =
target short. Frequency-agnostic: the same strategy runs on daily or
hourly bars.

---

## How to add a new strategy

1. Create `backend/strategies/<your_strategy>.py` with a class that
   inherits `BaseStrategy` and implements `generate_signals(bars)`.
2. Add it to the registry dict in `backend/strategies/__init__.py`.
3. Define `params_schema` (JSON Schema) on the class — the frontend
   auto-generates the config form from this.
4. Write a test in `tests/test_strategies.py`.
5. Add a row to `docs/strategies.md`.

The backtest engine, analytics, persistence, and UI all pick it up.

## How to add a new asset

Add a row to the seed list in `scripts/init_db.py` with `symbol`,
`asset_class`, `name`, `exchange`, `currency`. Re-run `init_db.py`.

## How to add a new data source

1. Subclass `BaseFetcher` in `backend/data/fetchers/<your_fetcher>.py`
   with `_fetch_raw(symbol, start, end, timeframe="1d")`.
2. If the source doesn't support hourly, raise `FetcherError` for
   non-`"1d"` timeframes.
3. Wire it into `DataAgent._FETCHERS`.
4. Document its quirks in `docs/data-sources.md`.

If the asset class is new, also map it in `DataAgent._CALENDAR_FOR`
and add periods-per-year entries in `backend/analytics/periods._TABLE`.

---

## Testing

```
tests/
├── test_engine_no_lookahead.py            ← the critical daily guard
├── test_engine_no_lookahead_hourly.py     ← same, hourly bars
├── test_engine_basics.py                  Smoke tests (fills, slippage)
├── test_cleaner_calendars.py              All 6 (calendar, timeframe) builders + bounded ffill
├── test_data_agent_calendar_dispatch.py   asset_class → calendar mapping
├── test_metrics.py                        Hand-checkable KPI cases
├── test_metrics_annualization.py          √N scaling across timeframes
├── test_periods_per_year.py               The lookup table
├── test_strategies.py                     Strategy signals on a fixture
├── test_llm.py | test_report_route.py     LLM & report endpoint
└── conftest.py                            Shared fixtures (db, trending_bars, …)
```

Run `pytest tests/test_engine_no_lookahead.py` if you ever touch the
engine. Run `pytest tests/test_cleaner_calendars.py` if you ever touch
the cleaner.

---

## Where to look first when debugging

| Symptom | First file to open |
|---------|---------------------|
| Strategy returns nonsense signals | `backend/strategies/<that_strategy>.py` and its test |
| KPIs look wrong | `backend/analytics/metrics.py` (each function docstrings the formula) |
| Backtest crashes mid-loop | `backend/backtest/engine.py` |
| Data fetch fails | `backend/data/fetchers/<source>.py` + `docs/data-sources.md` |
| Crypto weekend data missing | `backend/data/cleaner.py:_target_index` — make sure `calendar="24x7"` is wired through DataAgent for that asset |
| Annualized vol looks too small/large | `backend/analytics/periods.py` — wrong (timeframe, asset_class)? |
| API returns 500 | Relevant `backend/api/routes/*.py` + `backend/api/schemas.py` |
| Frontend can't reach backend | `frontend/vite.config.ts` (dev proxy) |
| Charts look empty | `backend/analytics/visualizations.py` |
| Hourly equity request returns 400 | yfinance 730-day cap — see `equity_fetcher.py` |

---

## Conventions

- **Database**: SQLite-compatible only. No `JSONB`, no `ARRAY`, no
  Postgres-specific functions. Composite primary keys via
  `PrimaryKeyConstraint`. All `DateTime` columns are timezone-naive UTC.
- **Logging**: module-level `log = structlog.get_logger(__name__)`.
  Don't `print()` in backend code.
- **LLM**: every call goes through `backend/llm/base.LLMProvider`.
  Never `import openai` / `import anthropic` / `import google.generativeai`
  outside `backend/llm/*_provider.py`. In v1, `LLM_ENABLED=false`; tests
  rely on `NullProvider`.
- **Look at internal data**: from a REPL, `OHLCVCleaner(...)._target_index(start, end)`
  is the fastest way to inspect what bars the cleaner will produce for a
  given (calendar, timeframe).

---

## Things to avoid

- **Don't hit external data APIs from inside a backtest.** Backtests
  read only from the local DB. Data fetching is a separate concern.
- **Don't tune strategy parameters by repeatedly running the full
  backtest.** That's the recipe for overfitting. Use walk-forward.
- **Don't add LLM calls outside the LLM agents.** Keep determinism elsewhere.
- **Don't `pandas.read_csv` as an ad-hoc data source** — go through a
  `BaseFetcher` so the lineage is recorded.
- **Don't use Postgres-only SQL.** Schema must run on SQLite.
- **Don't `print()`** — use `structlog`.

---

## Deep-dive references

- [`README.md`](README.md) — features, quick start, project layout
- [`CLAUDE.md`](CLAUDE.md) — guide for Claude Code (and humans) in this repo
- [`docs/calendars.md`](docs/calendars.md) — formal calendar definitions, algorithms
- [`docs/data-sources.md`](docs/data-sources.md) — every fetcher, intraday matrix
- [`docs/strategies.md`](docs/strategies.md) — what each strategy does
- [`docs/agents.md`](docs/agents.md) — agent responsibilities
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — deep architecture & design rationale
