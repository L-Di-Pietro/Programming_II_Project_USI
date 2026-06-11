# Architecture

A deep-dive into the design of QuantEdge. Read [`README.md`](./README.md) first for product context.

---

## Guiding principles

1. **Reproducibility over speed.** A backtest run on the same data with the same parameters must produce bit-identical results, every time. This rules out: live API calls during backtests, time-dependent randomness without a fixed seed, floating-point ordering ambiguity in the engine.
2. **Look-ahead bias is unacceptable.** Architecturally impossible (not just policy-impossible). Tested with an oracle strategy.
3. **Realism over optimism.** Commissions and slippage are *required* user inputs, not optional. The defaults are deliberately conservative.
4. **Composable agents over monolith.** Six narrowly-scoped agents, each with a clear contract and tool set, beats one god-class.
5. **The schema is the API.** Pydantic schemas in `backend/api/schemas.py` are the source of truth for both backend serialization and frontend types (via `openapi-typescript` codegen).

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  React + TypeScript Frontend                       │
│                                                                    │
│   Dashboard       NewBacktest      RunResults      Strategies     │
│   (run history)   (config wizard)  (charts/KPIs)   (library)      │
└──────────────────────────┬─────────────────────────────────────────┘
                           │   REST (JSON) — UI polls /backtests for status
┌──────────────────────────▼─────────────────────────────────────────┐
│                       FastAPI Backend                               │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │   Orchestrator Agent (LLM; demo mode unless Gemini env set)    │ │
│   │   ── routes structured / NL requests to deterministic agents   │ │
│   └──────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  Data Agent  │  Strategy Agent  │  Backtest Agent  │           │ │
│   │  Analytics Agent  │  Explanation Agent (LLM; demo by default)  │ │
│   └──────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  LLMProvider abstraction  → NullProvider / GeminiProvider      │ │
│   └──────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  Event-Driven Backtest Engine                                  │ │
│   │  bar loop → strategy → risk → execution → portfolio → equity   │ │
│   └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
                ┌──────────▼──────────┐
                │  SQLite (dev) or     │
                │  Postgres (prod)     │
                │  via SQLAlchemy 2.x  │
                └──────────────────────┘
                           ▲
                           │ APScheduler nightly refresh
            ┌──────────────┴──────────────┐
            │                              │
       ┌────▼─────┐ ┌────────────┐ ┌──────▼──────┐
       │ yfinance │ │   ccxt /   │ │   Stooq     │
       │ eq/ETF/  │ │  Binance   │ │  (FX fb)    │
       │ FX/crypto│ │ (crypto fb)│ │             │
       └──────────┘ └────────────┘ └─────────────┘
```

---

## The agents

Every agent inherits `BaseAgent[TIn, TOut]`. The public `run(payload)` wraps `_run(payload)` with timing logs and uniform error wrapping (`AgentError`), so the API layer can map any agent failure to a clean HTTP response.

### 1. Orchestrator Agent — LLM-backed (demo mode by default)

**Role.** Receives a natural-language request ("run an SMA crossover on AAPL for the last 5 years with 0.05% commission"), dispatches the other five agents as tools in a Python tool-use loop, and returns a single natural-language answer.

**Surface:** one op — `OrchestratorInput(user_message, history, max_steps=8) → OrchestratorOutput(final_answer, steps)`.

**Implementation.** The loop parses tool calls from the LLM's output via simple JSON extraction (so it works with any provider, not just providers with native function-calling). Each tool maps to one of the five other agents below.

**Default behaviour.** Because `backend/config.py` defaults to `LLM_ENABLED=false`, the orchestrator short-circuits in a fresh checkout — the API exposes structured endpoints directly and the orchestrator is bypassed. Flipping `LLM_ENABLED=true` + `LLM_PROVIDER=gemini` + `GEMINI_API_KEY=…` (or copying `.env.example`, which already sets the first two) activates it.

### 2. Data Agent — deterministic

**Role.** Fetches, cleans, and stores OHLCV bars; reports freshness; lists assets. Triggers nightly incremental refreshes via APScheduler.

**Operations** (dispatched by the `op` field on `DataAgentInput`):
- `"refresh"` — fetch latest bars for `(asset_id|symbol, timeframe)`, run them through `OHLCVCleaner`, upsert into `ohlcv_bars`. Incremental: starts at the most recently stored bar.
- `"freshness"` — return the timestamp of the most recent stored bar.
- `"list_assets"` — return all active rows from `assets`.

**Dispatch tables** (class-level):
- `_FETCHERS` — `equity`/`etf` → `EquityFetcher`, `crypto` → `CryptoFetcher`, `fx` → `FXFetcher`.
- `_CALENDAR_FOR` — `equity`/`etf` → `"nyse"`, `fx` → `"24x5"`, `crypto` → `"24x7"`.

### 3. Strategy Agent — deterministic

**Role.** Stateless utility over `backend.strategies` registry. No DB access.

**Operations:**
- `"list"` — return metadata (slug, name, description, category, JSON-Schema for params) for all 11 registered strategies.
- `"build"` — instantiate a strategy from `(slug, params)`; validates `params` against the strategy's Pydantic `config_cls`.
- `"walk_forward_split"` — chronological train/test split of a bars DataFrame; validates `0.1 < train_pct < 0.9`.

### 4. Backtest Agent — deterministic

**Role.** Drives an end-to-end backtest run.

**Single operation:**
1. Persist a `running` row in `backtest_runs` so the API can poll status.
2. Load bars from the local DB for the requested asset/timeframe.
3. Build the strategy via `StrategyAgent`.
4. Drive the event loop in `backend/backtest/engine.py` (portfolio + risk + execution).
5. Persist `trades`, `equity_curve`, and `metrics`.
6. Compute the **buy-and-hold** and **SPY buy-and-hold** benchmark equity curves and persist them to `benchmark_equity_curve` so the UI can overlay them on the chart without recomputation.
7. Mark the run `completed` (or `failed` with an error message).

### 5. Analytics Agent — deterministic

**Role.** Presentation layer over persisted run data.

**Operations:**
- `"metrics"` — load `metrics` rows for a run, group by category (`return`, `risk`, `trade`).
- `"chart"` — build a Plotly figure (JSON) for one of five chart kinds: `equity`, `drawdown`, `heatmap`, `trade_pnl`, `rolling_sharpe`.
- `"benchmark_metrics"` — derive metrics from a stored benchmark equity curve using the same metric functions as the strategy (with `trade_pnls=None` for buy-and-hold, so the trade-block KPIs are zeroed).

### 6. Explanation Agent — LLM-backed (demo mode by default)

**Role.** Translates run data into plain language. Caches generated reports.

**Operations:**
- `"explain_metric"` — interpret a single KPI in the context of its run.
- `"explain_strategy"` — what a strategy does and when it works or fails.
- `"compare_runs"` — side-by-side commentary on two runs.
- `"answer_question"` — open-ended Q&A grounded on a run's metrics.
- `"report_run"` — full markdown report with "Key findings" and "Limitations".

The agent also exposes `get_cached_report(run_id)` / `get_cached_report_timestamp(run_id)` so the `/report` GET endpoint can return cached text without hitting the LLM. `is_demo_mode` is `True` iff the underlying provider is `NullProvider` (the UI surfaces a "demo mode" badge in that case).

**Default behaviour.** With `LLM_ENABLED=false` (the `config.py` default), the provider is `NullProvider`, which returns deterministic canned text. With `LLM_ENABLED=true` + `LLM_PROVIDER=gemini` + a `GEMINI_API_KEY`, the agent talks to Google Gemini via `GeminiProvider`.

---

## The event-driven backtest engine

This is the heart of the system. It must be correct first, fast second.

```
for t, bar in enumerate(bars):
    # 1. Update portfolio mark-to-market on bar t's close
    portfolio.mark_to_market(bar.close)

    # 2. Strategy sees data through bar t — generates target position for end-of-bar t
    target = strategy.signal_at(t)

    # 3. Risk module computes order qty (delta from current position to target)
    order = risk.size_order(portfolio, target, bar)

    # 4. Order is *queued* — it does not execute on bar t.

    # 5. On the NEXT iteration, the queued order fills at bar t+1's open
    #    after slippage and commission are applied.
```

### Why this prevents look-ahead bias

A strategy can compute *anything* using prices up to and including bar `t`'s close. But the cash impact of any decision it makes is felt only at bar `t+1`'s open. This means:

- Knowing bar `t`'s close cannot help you trade *at* bar `t`'s close. The earliest fill is the next bar's open.
- The strategy cannot observe bar `t+1`'s open before placing an order — it doesn't exist yet in its data view.
- Slippage is applied *to* the bar `t+1` open price, not to bar `t`'s close. There's no way for the strategy to game the slippage calculation.

The unit test `tests/test_engine_no_lookahead.py` injects an "oracle" strategy that knows the future close. It asserts that the engine still only fills it at the next-bar open — i.e. the oracle's foreknowledge does not yield same-bar profits.

### Position sizing

In v1 we ship two sizing modes:

- **Fixed fractional**: each new entry uses `risk_fraction * current_equity` worth of cash, integer-rounded to whole shares (or fractional units for crypto/FX).
- **Volatility-targeted**: scale position size inversely with realized volatility (rolling 20-bar standard deviation of log returns) so the per-position risk in dollar terms is constant.

### Slippage model

Exposed as a user parameter:

- **Bps slippage**: `fill_price = bar_open * (1 + side * slippage_bps / 10_000)`

An ATR-scaled variant (`fill_price = bar_open + side * k * ATR_t`) is a candidate
v1.1+ extension; v1 ships the bps model only.

### Commission model

`commission_cost = qty * fill_price * commission_bps / 10_000`. Symmetric on entry and exit.

### Risk circuit breaker

Optional max-drawdown circuit breaker: if equity drops more than `max_dd_pct` from peak, close all positions and halt the strategy. Off by default; controlled by user param.

---

## The data layer

### Pull-and-cache

We do **not** hit external APIs during a backtest. Period. Backtests read from the local SQL database. Data ingestion is a separate concern, run on first install (`scripts/load_initial_data.py`) and nightly thereafter (APScheduler).

### Fetcher hierarchy

```
BaseFetcher (ABC)
├── EquityFetcher    → yfinance Ticker.history()
├── CryptoFetcher    → yfinance Ticker.history(), ccxt/Binance fallback
└── FXFetcher        → yfinance EURUSD=X, Stooq fallback via pandas-datareader
```

Each fetcher has retry/backoff logic and returns a uniform `DataFrame[open, high, low, close, volume]` indexed by tz-naive UTC datetime.

### Cleaner

`backend/data/cleaner.py` (`OHLCVCleaner`) runs four passes on every fetched DataFrame:

1. **Sort & dedup** — sort by index ascending, drop duplicate timestamps (keep last).
2. **Sanity** — drop rows with NaN OHLC, non-positive prices, or `high < max(open, low, close)` / `low > min(open, high, close)` (with a 0.01% tolerance).
3. **Calendar reindex** — reindex onto the **native** trading calendar for the asset class (see below). Both daily and hourly grids are supported.
4. **Bounded forward-fill** — only NaN runs of length ≤ 2 are filled, with `volume = 0` on the carried rows. Longer outages survive as NaN, surface in `CleaningReport.gaps_remaining`, and are dropped from the final frame.

The diagnostics returned via `CleaningReport(rows_in, rows_out, duplicates_dropped, bad_rows_dropped, forward_filled, gaps_remaining)` are logged on every fetch so a missing-data investigation has a paper trail.

### Calendar choice

Each asset class uses its **native** trading calendar — there is no cross-asset reindex onto a single common calendar:

| Asset class    | Calendar           | Daily bars/year | Hourly bars/year |
|----------------|--------------------|------------------|--------------------|
| Equity / ETF   | NYSE (XNYS)        | 252              | 1638 (252 × 6.5)   |
| FX             | 24×5 (Sun 22:00 UTC → Fri 22:00 UTC) | 260 | 6240          |
| Crypto         | 24×7               | 365              | 8760               |

The dispatch lives in `DataAgent._CALENDAR_FOR`. The annualization factors that power vol/Sharpe/Sortino are looked up in `backend/analytics/periods.py:periods_per_year(timeframe, asset_class)`. See [`docs/calendars.md`](docs/calendars.md) for the algorithms that build each (calendar, timeframe) index.

---

## Database schema

SQLite-compatible, Postgres-portable. All types are SQLAlchemy generics.

### `assets`
```
id PK, symbol, asset_class, name, exchange, currency, is_active, created_at
```

### `ohlcv_bars`
```
asset_id FK, ts, timeframe   (composite PK)
open, high, low, close, volume, source
indexed on (asset_id, ts)
```

### `strategies`
```
id PK, slug UNIQUE, name, description, params_schema (JSON), created_at
```

### `backtest_runs`
```
id PK, strategy_id FK, asset_id FK, timeframe,
start_date, end_date, params (JSON),
commission_bps, slippage_bps, initial_cash,
status, error_message, created_at, completed_at
```

### `trades`
```
id PK, run_id FK, ts, side, qty, price,
commission, slippage_cost, gross_pnl, net_pnl
```

### `equity_curve`
```
run_id FK, ts   (composite PK)
equity, cash, position_value, drawdown_pct
```

### `benchmark_equity_curve`
```
run_id FK, kind, ts   (composite PK; kind ∈ {asset_buyhold, spy_buyhold})
equity
```
One row per (run, benchmark kind, bar). Populated by `BacktestAgent` at run time; powers the buy-and-hold and SPY overlays on the equity chart. Deliberately omits `cash` / `position_value` (overlay-only).

### `metrics`
```
run_id FK, metric_name, value, category   (PK on (run_id, metric_name))
category in {return, risk, trade}
```

### `llm_conversations`
```
id PK, run_id FK, role, content, model,
prompt_tokens, completion_tokens, created_at
```
Empty in v1; populated when LLM is enabled.

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET  | `/healthz` | Liveness probe; returns `{status, llm_enabled, llm_provider}` |
| GET  | `/strategies` | List all 11 registered strategies + their `params_schema` |
| GET  | `/assets` | List active assets in the universe |
| POST | `/assets/{symbol}/refresh?timeframe=…` | Trigger a manual data refresh for one timeframe |
| POST | `/backtests` | Submit a backtest run — **synchronous**: blocks until `BacktestAgent.run()` returns, then responds with the persisted summary |
| GET  | `/backtests?limit=…` | List runs newest-first |
| GET  | `/backtests/{run_id}` | Run status + summary |
| GET  | `/backtests/{run_id}/metrics` | Metrics grouped by `return` / `risk` / `trade` |
| GET  | `/backtests/{run_id}/equity` | Equity curve series |
| GET  | `/backtests/{run_id}/trades` | Trade ledger |
| GET  | `/backtests/{run_id}/charts/{kind}` | Plotly figure JSON; `kind ∈ {equity, drawdown, heatmap, trade_pnl, rolling_sharpe}` |
| GET  | `/backtests/{run_id}/benchmark/{kind}/equity` | Benchmark equity curve; `kind ∈ {buy_and_hold, sp500}` |
| GET  | `/backtests/{run_id}/benchmark/{kind}/metrics` | Benchmark KPIs (trade block zeroed) |
| GET  | `/backtests/{run_id}/report` | Cached LLM report (404 if not yet generated) |
| POST | `/backtests/{run_id}/report` | Generate a fresh LLM report (overwrites cache) |
| POST | `/explain` | LLM Q&A over a run (demo mode unless Gemini is configured) |

There is **no WebSocket endpoint**; the Dashboard polls `GET /backtests` every 5 s to track in-flight or recently-completed runs. Pydantic schemas in `backend/api/schemas.py` define every payload.

---

## LLM provider abstraction

```python
# backend/llm/base.py
class LLMProvider(ABC):
    @abstractmethod
    def generate(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse: ...
```

Implementations:

- `NullProvider` — deterministic offline stand-in. Extracts the last user message, computes a stable SHA-256 digest, and returns demo-mode text. Always available; used in tests; the safe default when `LLM_ENABLED=false`.
- `GeminiProvider` — Google Gemini integration using the `google-genai` SDK. Maps `assistant` → `model` for the Gemini role convention; passes the system prompt via `system_instruction`; wraps each call in an exponential-backoff retry (up to 4 attempts, base 1.5 s) for transient errors (429/500/503/504). Reports `prompt_tokens` and `completion_tokens` from the response metadata.

`LLMFactory.from_settings()` is the single dispatch point: it returns `NullProvider` whenever `LLM_ENABLED=false`, regardless of `LLM_PROVIDER`. To activate Gemini, set `LLM_ENABLED=true`, `LLM_PROVIDER=gemini`, and `GEMINI_API_KEY=…` in `.env`. The committed `.env.example` ships with the first two already set, so a fresh `cp .env.example .env` activates Gemini as soon as an API key is supplied; without a key, LLM endpoints fail loudly rather than silently fall back.

The Explanation Agent and Orchestrator both depend only on the abstract `LLMProvider`, so adding a new provider is a single file in `backend/llm/` plus a branch in `LLMFactory`.

---

## Frontend architecture

- **React Router** — `/`, `/strategies`, `/backtests/new`, `/backtests/:id`.
- **Pages** orchestrate **components** which are pure (props in, JSX out).
- **API client** in `src/api/client.ts` — typed; `openapi-typescript` is wired (`npm run gen:types`) so the client types can be regenerated from the live FastAPI OpenAPI schema.
- **State** — local `useState` + URL params. No Redux. If global state grows, add Zustand (lightweight).
- **Charts** — Plotly.js consumed via `react-plotly.js`. Backend builds the figure JSON; frontend just renders it. This means chart logic is testable in Python.
- **Shared UI primitives** (shipped recently and load-bearing for the results experience):
  - `CrosshairOverlay` — a single crosshair tooltip synced across the equity, drawdown, trade-P&L, and rolling-Sharpe charts on hover.
  - `ChartLegend` — one legend rendered above the chart panel, showing the strategy plus any active benchmark overlays.
  - `BenchmarkToggleBar` — pill controls that toggle buy-and-hold and SPY overlays on every chart that supports them (data is fetched lazily and cached client-side).
  - `ReportCard` — renders the LLM report with a "regenerate" action and a one-click PDF export powered by `jsPDF`.

---

## Reproducibility checklist

A backtest run is reproducible if and only if:

- [x] Data is read from the local DB (not a live API)
- [x] Strategy parameters are stored in `backtest_runs.params`
- [x] Commission and slippage are stored in `backtest_runs`
- [x] Random seeds are fixed (relevant for vol-targeting if it ever uses simulation)
- [x] The engine iterates bars in deterministic order (sorted by `ts`)
- [x] Floating-point reductions are deterministic (avoid `set` ordering, parallel non-deterministic sums)

Re-running a stored `backtest_runs` row should produce a byte-identical `equity_curve` and `trades` ledger. The integration test `tests/test_reproducibility.py` (Tier 4) asserts this.

---

## Future architectural extensions

### Walk-forward UI (v1.2)
Strategy Agent already supports walk-forward splits. The UI needs a panel that lets users define rolling train/test windows and runs N stitched backtests.

### Multi-asset portfolio strategies (v2.0)
Today, `backtest_runs.asset_id` is scalar. To support portfolios, change to an `asset_ids[]` array and add a `weights` table. Engine loop changes from per-asset to per-portfolio.

### Intraday data (v2.0)
The schema already has a `timeframe` column. Intraday is a matter of new fetcher implementations and tuning the engine for higher bar volumes.

### Vector store for strategy similarity search
Mentioned in the spec as an optional non-trivial DB feature. A `pgvector` column on `strategies.description_embedding` would let the Explanation Agent recommend similar strategies. Out of scope for v1.

---

_Last verified against code: 2026-06-11._
