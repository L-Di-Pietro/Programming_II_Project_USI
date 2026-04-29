# Architecture

A deep-dive into the design of QuantBacktest. Read [`README.md`](./README.md) first for product context.

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
                           │   REST (JSON)
                           │   WebSocket (run progress)
┌──────────────────────────▼─────────────────────────────────────────┐
│                       FastAPI Backend                               │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │   Orchestrator Agent (LLM-backed, disabled in v1)              │ │
│   │   ── routes structured / NL requests to deterministic agents   │ │
│   └──────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  Data Agent  │  Strategy Agent  │  Backtest Agent  │           │ │
│   │  Analytics Agent  │  Explanation Agent (LLM, disabled v1)      │ │
│   └──────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  LLMProvider abstraction  → NullProvider (v1) / Gemini (v1.1) │ │
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
       │ yfinance │ │ CoinGecko  │ │   Stooq     │
       │  + Stooq │ │  + ccxt    │ │  (FX fb)    │
       └──────────┘ └────────────┘ └─────────────┘
```

---

## The agents

### 1. Orchestrator Agent — LLM-backed (disabled in v1)

**Role.** Receives a request — either structured (from the Wizard UI) or natural language ("run an SMA crossover on AAPL for the last 5 years with 0.05% commission") — plans the workflow, dispatches sub-agents, returns a unified response.

**Tools (when enabled):**
- `route_request(request) -> AgentPlan`
- `plan_workflow(plan) -> list[AgentCall]`
- `aggregate_results(results) -> Response`

**v1 behaviour.** In v1 the API exposes structured endpoints directly and the Orchestrator's class is bypassed. The class is fully written so that flipping `LLM_ENABLED=true` and providing a `GeminiProvider` activates it without touching other code.

### 2. Data Agent — deterministic

**Role.** Fetches, validates, cleans, and stores OHLCV bars. Tracks data freshness. Triggers nightly incremental refreshes.

**Tools:**
- `fetch_equity(symbol, start, end)` → `EquityFetcher`
- `fetch_crypto(symbol, start, end)` → `CryptoFetcher`
- `fetch_fx(symbol, start, end)` → `FXFetcher`
- `validate_ohlcv(df)` → bool + report
- `store_bars(asset_id, df)`
- `check_data_freshness(asset_id)` → datetime of last bar

### 3. Strategy Agent — deterministic

**Role.** Lists available strategies, configures them with user parameters, and runs signal generation. Owns the walk-forward / IS-OOS split logic.

**Tools:**
- `list_strategies()`
- `configure_params(strategy_slug, params)` → validated `StrategyConfig`
- `generate_signals(strategy, bars)` → signal `Series`
- `walk_forward_split(bars, train_pct)` → `(train_bars, test_bars)`

### 4. Backtest Agent — deterministic

**Role.** Drives the event-driven engine. Combines strategy signals with the portfolio, risk, and execution components to produce a trade ledger and equity curve.

**Tools:**
- `run_backtest(config)` → `BacktestResult`
- `apply_slippage(price, side, slippage_bps)`
- `apply_commissions(qty, price, commission_bps)`
- `size_position(equity, price, risk_params)`
- `track_pnl(trades)`

### 5. Analytics Agent — deterministic

**Role.** Computes KPIs and chart payloads from the trade ledger and equity curve.

**Tools:**
- `compute_metrics(equity_curve, trades)` → `MetricsResult`
- `build_equity_curve(equity_curve)` → Plotly JSON
- `build_drawdown(equity_curve)` → Plotly JSON
- `build_heatmap(equity_curve)` → Plotly JSON
- `compute_trade_stats(trades)` → trade-level KPIs

### 6. Explanation Agent — LLM-backed (disabled in v1)

**Role.** Translates KPIs into plain language, answers user follow-up questions about a run, compares two runs side by side.

**Tools (when enabled):**
- `explain_metric(metric_name, value, context)`
- `explain_strategy(strategy_slug)`
- `compare_runs(run_a, run_b)`
- `answer_question(run_id, user_question)`

**v1 behaviour.** Uses `NullProvider` which returns deterministic canned text. The `/explain` route is live and the UI panel is rendered (with a "demo mode" badge); flipping `LLM_ENABLED=true` and implementing `GeminiProvider.generate()` activates real responses.

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

Two options exposed as user parameters:

- **Bps slippage**: `fill_price = bar_open * (1 + side * slippage_bps / 10_000)`
- **ATR slippage**: `fill_price = bar_open + side * k * ATR_t` for some user `k`

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
├── CryptoFetcher    → CoinGecko market_chart API, ccxt/Binance fallback
└── FXFetcher        → yfinance EURUSD=X, Stooq fallback via pandas-datareader
```

Each fetcher has retry/backoff logic and returns a uniform `DataFrame[open, high, low, close, volume]` indexed by tz-naive UTC datetime.

### Cleaner

`backend/data/cleaner.py` runs three passes on every fetched DataFrame:

1. **Sanity** — drop rows with negative or zero prices, NaN OHLC, `high < low`, etc.
2. **Dedup** — collapse duplicate timestamps (keeping the last).
3. **Calendar reindex** — for cross-asset comparability, reindex to the NYSE business-day calendar. BTC weekend bars are forward-filled or aligned to the daily close; FX weekend gaps are forward-filled.

### Calendar choice

Three asset classes, three native calendars:

- Equities → NYSE trading days
- Crypto → 24/7
- FX → 24/5 with weekend gaps

We standardize on **NYSE business days** (the most restrictive). Cross-asset backtests are aligned. This is a deliberate simplification documented as a known limitation.

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
| GET | `/healthz` | Liveness probe |
| GET | `/strategies` | List available strategies + their `params_schema` |
| GET | `/assets` | List assets in the universe |
| POST | `/assets/{symbol}/refresh` | Trigger a manual data refresh |
| POST | `/backtests` | Submit a new backtest run (returns `run_id`) |
| GET | `/backtests` | List runs (paginated) |
| GET | `/backtests/{run_id}` | Get run status + summary |
| GET | `/backtests/{run_id}/metrics` | Full metrics block |
| GET | `/backtests/{run_id}/equity` | Equity curve series |
| GET | `/backtests/{run_id}/trades` | Trade ledger |
| GET | `/backtests/{run_id}/charts/{kind}` | Plotly figure JSON: `equity`, `drawdown`, `heatmap` |
| POST | `/explain` | LLM Q&A over a run (NullProvider in v1) |
| WS | `/ws/runs/{run_id}` | Stream run progress events |

Pydantic schemas in `backend/api/schemas.py` define every payload.

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

- `NullProvider` — returns deterministic canned text. Used in v1 and in tests. Always available.
- `GeminiProvider` — Google Gemini API skeleton. Raises `NotImplementedError` until completed in v1.1.

The Explanation Agent depends on the abstract `LLMProvider`, not on a concrete implementation. Switching providers is a one-line config change.

---

## Frontend architecture

- **React Router** — `/`, `/strategies`, `/backtests/new`, `/backtests/:id`
- **Pages** orchestrate **components** which are pure (props in, JSX out).
- **API client** in `src/api/client.ts` — typed via codegen from the FastAPI OpenAPI schema.
- **State** — local `useState` + URL params for now. No Redux. If global state grows, add Zustand (lightweight).
- **Charts** — Plotly.js consumed via `react-plotly.js`. Backend builds the figure JSON; frontend just renders it. This means chart logic is testable in Python.

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
