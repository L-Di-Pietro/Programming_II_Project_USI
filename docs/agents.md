# Agents

Six specialized agents wire the deterministic services and (future) LLM
services into a coherent system. Four agents are deterministic and run in
v1; two are LLM-backed and gated behind `LLM_ENABLED=false` in v1.

| # | Agent | Mode | Tools (skills) |
|---|---|---|---|
| 1 | Orchestrator | LLM (disabled v1) | `route_request`, `plan_workflow`, `aggregate_results` |
| 2 | Data | deterministic | `fetch_equity`, `fetch_crypto`, `fetch_fx`, `validate_ohlcv`, `store_bars`, `check_data_freshness` |
| 3 | Strategy | deterministic | `list_strategies`, `configure_params`, `generate_signals`, `walk_forward_split` |
| 4 | Backtest | deterministic | `run_backtest`, `apply_slippage`, `apply_commissions`, `size_position`, `track_pnl` |
| 5 | Analytics | deterministic | `compute_metrics`, `build_equity_curve`, `build_drawdown`, `build_heatmap`, `compute_trade_stats` |
| 6 | Explanation | LLM (disabled v1) | `explain_metric`, `explain_strategy`, `compare_runs`, `answer_question` |

## Common contract

Every agent inherits from `BaseAgent[TIn, TOut]` and exposes:

```python
agent.run(input: TIn) -> TOut
```

`BaseAgent.run` wraps `_run` with timing logs and uniform error wrapping
(`AgentError`). When the API layer catches one type, it can map it cleanly
to a 400/500 response.

## When to call an agent vs an inline service

The agents are coordinated by the Orchestrator (when LLM is on) or by the
API routes directly (in v1). For very simple deterministic operations the
API can call into the underlying service directly — e.g. listing
strategies just iterates `STRATEGY_REGISTRY`. Use an agent when the
operation needs:

- Database access
- Multiple steps (e.g. fetch + clean + store)
- A natural place to log structured events
- Future LLM tool-use (the Orchestrator dispatches by agent name)

## Implementation notes per agent

### Orchestrator

In v1 it short-circuits because `settings.llm_enabled is False`. When the
Gemini provider is implemented, flipping `LLM_ENABLED=true` activates a
tool-use loop that calls the other five agents as tools. The tool input
types are taken from each agent's `*Input` dataclass.

### Data Agent

- Looks up the asset row and dispatches to the right fetcher by asset class.
- Determines start of fetch from the most recent stored bar (incremental).
- Runs `OHLCVCleaner` on the raw frame.
- Upserts via SQLite `INSERT ... ON CONFLICT DO UPDATE`. (Postgres prod
  would use `postgresql.insert` instead — same shape, different import.)

### Strategy Agent

Stateless utility wrapping `backend.strategies`. Useful operations:

- `list` — return all registered strategies + their JSON Schema.
- `build` — instantiate a strategy from a slug + params dict, validating
  via the strategy's `config_cls`.
- `walk_forward_split` — chronological train/test split.

### Backtest Agent

The agent does the heavy lifting of running a single backtest:

1. Persists a "running" row so the API can poll status.
2. Loads bars from DB (never live API).
3. Builds the strategy.
4. Calls `run_backtest`.
5. Persists trades, equity curve, metrics.

### Analytics Agent

- `metrics` — returns metrics grouped by category (return / risk / trade).
- `chart` — returns Plotly figure JSON for one of the standard charts.

### Explanation Agent

Wraps the `LLMProvider` with prompt builders for the four supported ops.
In v1 the provider is `NullProvider`, so the prompts are still constructed
(and persisted) but the response is canned demo text. When Gemini lands,
no code in this agent has to change.

## Future agent additions

- **Walk-forward Agent** — build train/test pairs, run backtests in batch,
  aggregate parameter robustness reports. (v1.2)
- **Comparison Agent** — diff two runs, build dual-equity charts. Could
  also be a method on Analytics. (v1.2)
