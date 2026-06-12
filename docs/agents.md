# Agents

Five specialized agents wire the deterministic services and the LLM
services into a coherent system. Four agents are deterministic and
always run; one is LLM-backed and operates in demo mode (`NullProvider`)
unless Gemini is configured via env.

| # | Agent | Mode | Real operations (dispatch by `op`) |
|---|---|---|---|
| 1 | Data | deterministic | `refresh`, `freshness`, `list_assets` |
| 2 | Strategy | deterministic | `list`, `build`, `walk_forward_split` |
| 3 | Backtest | deterministic | one op — run a single backtest end-to-end and persist trades / equity / metrics / benchmark curves |
| 4 | Analytics | deterministic | `metrics`, `chart` (5 kinds: `equity, drawdown, heatmap, trade_pnl, rolling_sharpe`), `benchmark_metrics` |
| 5 | Explanation | LLM (demo by default) | `explain_metric`, `explain_strategy`, `compare_runs`, `answer_question`, `report_run` (+ persisted report cache) |

## Common contract

Every agent inherits from `BaseAgent[TIn, TOut]` and exposes:

```python
agent.run(input: TIn) -> TOut
```

`BaseAgent.run` wraps `_run` with timing logs and uniform error wrapping
(`AgentError`). When the API layer catches one type, it can map it cleanly
to a 400/500 response.

## When to call an agent vs an inline service

The agents are coordinated by the API routes directly. For very simple
deterministic operations the API can call into the underlying service
directly — e.g. listing strategies just iterates `STRATEGY_REGISTRY`. Use
an agent when the operation needs:

- Database access
- Multiple steps (e.g. fetch + clean + store)
- A natural place to log structured events

## Implementation notes per agent

### Data Agent

- Three `op`s: `refresh` (fetch + clean + upsert), `freshness` (timestamp of last stored bar), `list_assets` (all active rows).
- Looks up the asset row and dispatches to the right fetcher class via `_FETCHERS` (`equity`/`etf` → `EquityFetcher`, `crypto` → `CryptoFetcher`, `fx` → `FXFetcher`) and to the right cleaner calendar via `_CALENDAR_FOR` (`equity`/`etf` → `"nyse"`, `fx` → `"24x5"`, `crypto` → `"24x7"`).
- Determines start of fetch from the most recent stored bar (incremental).
- Runs `OHLCVCleaner` on the raw frame.
- Upserts via SQLite `INSERT ... ON CONFLICT DO UPDATE`. Postgres prod would use `postgresql.insert` — same shape, different import.

### Strategy Agent

Stateless utility wrapping `backend.strategies`. No DB access. Three ops:

- `list` — return metadata for the registered strategies (slug, name, description, category, JSON Schema for params). The public `/strategies` endpoint serves the 10 selectable strategies; the buy-and-hold entry is benchmark-only and hidden from the picker.
- `build` — instantiate a strategy from `(slug, params)`, validating `params` against the strategy's Pydantic `config_cls`.
- `walk_forward_split` — chronological train/test split of a bars DataFrame; validates `0.1 < train_pct < 0.9`.

### Backtest Agent

A single-op agent. Each invocation runs an end-to-end backtest:

1. Persists a `running` row so the API can poll status.
2. Loads bars from the local DB (never a live API).
3. Builds the strategy via `StrategyAgent`.
4. Drives the engine loop in `backend/backtest/engine.py`.
5. Persists `trades`, `equity_curve`, and `metrics`.
6. Computes and persists the **same-asset buy-and-hold** and **SPY buy-and-hold** benchmark equity curves to `benchmark_equity_curve`, so the UI can draw overlays without recomputation.
7. Marks the run `completed` (or `failed` with the error message).

### Analytics Agent

Presentation layer over persisted run data. Three ops:

- `metrics` — load `metrics` rows for a run, group by category (`return`, `risk`, `trade`).
- `chart` — build a Plotly figure (JSON) for one of five chart kinds: `equity`, `drawdown`, `heatmap`, `trade_pnl`, `rolling_sharpe`.
- `benchmark_metrics` — derive KPIs from a stored benchmark equity curve using the same metric functions as the strategy (with `trade_pnls=None`, so the trade block is zeroed for buy-and-hold).

### Explanation Agent

Wraps the `LLMProvider` with prompt builders for five ops:

- `explain_metric` — interpret a single KPI in context.
- `explain_strategy` — what a strategy does and when it works or fails.
- `compare_runs` — side-by-side commentary on two runs.
- `answer_question` — open-ended Q&A grounded on a run's metrics.
- `report_run` — full markdown report with "Key findings" and "Limitations".

The agent persists conversation turns to `llm_conversations` and exposes `get_cached_report(run_id)` + `get_cached_report_timestamp(run_id)` so the `GET /backtests/{run_id}/report` endpoint can return a cached report without hitting the LLM (regenerate via `POST` to the same path). The `is_demo_mode` property is `True` iff the underlying provider is `NullProvider` — the UI surfaces a "demo mode" badge in that case.

With `LLM_ENABLED=false` (the `config.py` default) the provider is `NullProvider`; switching to Gemini requires `LLM_ENABLED=true` + `LLM_PROVIDER=gemini` + `GEMINI_API_KEY=…`.

## Future agent additions

- **Walk-forward Agent** — build train/test pairs, run backtests in batch, aggregate parameter robustness reports. (v1.1)
- **Comparison Agent** — diff two runs, build dual-equity charts. Could also be a method on Analytics. (v1.2)

---

_Last verified against code: 2026-05-24._
