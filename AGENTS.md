# AGENTS.md — The AI-collaborator contract for QuantBacktest

> This file is the canonical contract for any **AI coding agent** (Claude Code, GitHub Copilot, Cursor, Codex, ChatGPT, Google Gemini, …) that contributes to this repository. It is required by the *Programming in Finance II — Project 2.8* rubric and is intentionally distinct from [`docs/agents.md`](docs/agents.md), which documents the six **runtime agents** that live *inside* the product. This file documents the **collaboration rules** for the agents that help us build it.
>
> Human contributors should also read this file — the rules it captures (commit-message convention, "never `import openai` outside `backend/llm/`", look-ahead-bias invariant, etc.) apply to everyone. The deep mechanical setup for humans lives in [`CONTRIBUTING.md`](CONTRIBUTING.md); the architectural why lives in [`ARCHITECTURE.md`](ARCHITECTURE.md); the terse decision-grid for *Claude Code in particular* lives in [`CLAUDE.md`](CLAUDE.md).

---

## 1. Why this project is organised agentically

QuantBacktest is a six-agent system because the work it performs is genuinely heterogeneous: fetching market data, validating strategy parameters, running an event-driven backtest loop, computing KPIs, rendering Plotly charts, and generating natural-language reports each have different determinism guarantees, different failure modes, and different latency profiles. Splitting them apart lets us keep the deterministic surface (data, strategy, backtest, analytics) reproducible bar-for-bar across machines, and isolate the only two non-deterministic agents (orchestrator, explanation) behind a single [`LLMProvider`](backend/llm/base.py) abstraction with a `NullProvider` default. The result is a product where **tests never call an LLM**, **backtests never call a live API**, and the LLM features are opt-in via three environment variables (`LLM_ENABLED=true`, `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=…`). The same separation is what makes the codebase tractable for AI contributors: any non-trivial change is scoped to one agent or to one well-defined seam between two of them.

---

## 2. The six runtime agents — public interface, responsibility, extension point

All agents inherit from `BaseAgent[TIn, TOut]` defined in `backend/agents/base.py`. The single public method is:

```python
agent.run(payload: TIn) -> TOut          # wraps _run with timing + AgentError mapping
```

Each concrete agent implements `_run(payload)`. The API layer calls `agent.run(...)`, never `_run` directly.

### 2.1 Orchestrator agent — LLM, demo by default

- **File:** `backend/agents/orchestrator.py`
- **Responsibility:** Receive a natural-language request, run a Python-side tool-use loop, dispatch tool calls to the five other agents, and return a final answer.
- **Input / output:** `OrchestratorInput(user_message: str, history: list[ChatTurn] = [], max_steps: int = 8) → OrchestratorOutput(final_answer: str, steps: list[ToolCall])`
- **Example invocation:**
  ```python
  from backend.agents.orchestrator import OrchestratorAgent, OrchestratorInput
  agent = OrchestratorAgent(db_session)
  out = agent.run(OrchestratorInput(user_message="What was the Sharpe of run 7?"))
  print(out.final_answer)
  ```
- **How to extend:** Add a new tool by registering it in the orchestrator's tool table; the schema is JSON-extracted from the model output rather than relying on a provider-specific function-calling SDK, so the change is provider-agnostic. If the new tool needs to live in its own agent, build that agent first (see §2.2–§2.6) and register its `run(...)` here.

### 2.2 Data agent — deterministic

- **File:** `backend/agents/data_agent.py`
- **Responsibility:** Fetch, clean, and persist OHLCV bars; report freshness; list assets.
- **Input / output:** `DataAgentInput(op: Literal["refresh","freshness","list_assets"], symbol: str | None = None, timeframe: str = "1d") → DataAgentOutput`
- **Example invocation:**
  ```python
  agent = DataAgent(db_session)
  agent.run(DataAgentInput(op="refresh", symbol="SPY", timeframe="1d"))
  ```
- **How to extend (new data source):** subclass `BaseFetcher` in `backend/data/fetchers/<your_fetcher>.py`, wire it into `_FETCHERS` in this file, add the right calendar key to `_CALENDAR_FOR`, and update `docs/data-sources.md`. The cleaner (`backend/data/cleaner.py`) reindexes onto the calendar you choose. See [`CLAUDE.md#how-to-add-a-new-asset-class-or-data-source`](CLAUDE.md).

### 2.3 Strategy agent — deterministic

- **File:** `backend/agents/strategy_agent.py`
- **Responsibility:** Stateless registry wrapper. Lists strategies, validates params via Pydantic, builds instances, splits bars for walk-forward.
- **Input / output:** `StrategyAgentInput(op: Literal["list","build","walk_forward_split"], slug: str | None = None, params: dict | None = None, bars: pd.DataFrame | None = None, train_pct: float = 0.7) → StrategyAgentOutput`
- **Example invocation:**
  ```python
  agent = StrategyAgent()
  out = agent.run(StrategyAgentInput(op="list"))   # returns all 11 strategies + their JSON Schema
  ```
- **How to extend (new strategy):** subclass `BaseStrategy` in `backend/strategies/<your_strategy>.py`, define a Pydantic `Config` (which becomes `params_schema`), implement `generate_signals(bars) -> pd.Series[int]` returning values in `{-1, 0, 1}`, register it in `backend/strategies/__init__.py`'s `STRATEGY_REGISTRY`, and add a test fixture. The frontend's parameter form is auto-generated from `params_schema`, so you get a UI for free.

### 2.4 Backtest agent — deterministic

- **File:** `backend/agents/backtest_agent.py`
- **Responsibility:** End-to-end backtest run. Loads bars from the local DB (never a live API), drives `backend/backtest/engine.py`, persists trades / equity curve / metrics, computes the same-asset and SPY buy-and-hold benchmark curves.
- **Input / output:** `BacktestAgentInput(run_id: int, asset_symbol: str, strategy_slug: str, params: dict, start_date, end_date, timeframe, initial_cash, commission_bps, slippage_bps, sizing_mode, risk_fraction, max_dd_pct=None) → BacktestAgentOutput(run_id, status, final_equity, trade_count)`
- **Example invocation:**
  ```python
  agent = BacktestAgent(db_session)
  out = agent.run(BacktestAgentInput(run_id=42, asset_symbol="SPY",
                                     strategy_slug="sma-crossover",
                                     params={"fast_window": 20, "slow_window": 50},
                                     start_date=..., end_date=..., timeframe="1d",
                                     initial_cash=10_000, commission_bps=5, slippage_bps=2,
                                     sizing_mode="fixed_fraction", risk_fraction=1.0))
  ```
- **How to extend:** the engine itself lives at `backend/backtest/engine.py` (event loop), `backend/backtest/portfolio.py` (position state), `backend/backtest/execution.py` (commission, slippage), `backend/backtest/risk.py` (sizing + circuit breaker). Any new execution model must preserve the **bar-`t` → bar-`t+1` fill rule** — see [§4](#4-the-non-negotiable-invariants-every-ai-contribution-must-respect).

### 2.5 Analytics agent — deterministic

- **File:** `backend/agents/analytics_agent.py`
- **Responsibility:** Compute KPIs from persisted trades + equity, build Plotly figures, derive benchmark KPIs from stored benchmark curves.
- **Input / output:** `AnalyticsAgentInput(op: Literal["metrics","chart","benchmark_metrics"], run_id: int, chart_kind: Literal["equity","drawdown","heatmap","trade_pnl","rolling_sharpe"] | None = None, benchmark_kind: Literal["buy_and_hold","sp500"] | None = None) → AnalyticsAgentOutput`
- **Example invocation:**
  ```python
  agent = AnalyticsAgent(db_session)
  out = agent.run(AnalyticsAgentInput(op="chart", run_id=42, chart_kind="equity"))
  ```
- **How to extend (new chart):** add the builder to `backend/analytics/visualizations.py`, accept the new `chart_kind` literal here, and the existing `GET /backtests/{run_id}/charts/{kind}` endpoint will surface it. For a new KPI, add a function to `backend/analytics/metrics.py` (docstring with the formula and citation), then have the relevant computation path persist it as a `Metric` row.

### 2.6 Explanation agent — LLM, demo by default

- **File:** `backend/agents/explanation_agent.py`
- **Responsibility:** Generate natural-language interpretations of a run (explain a metric, explain a strategy, compare two runs, answer a free-form question, write a full markdown report). Persists the conversation to `llm_conversations` and caches reports per `run_id`.
- **Input / output:** `ExplanationAgentInput(op: Literal["explain_metric","explain_strategy","compare_runs","answer_question","report_run"], run_id: int | None, other_run_id: int | None = None, metric_name: str | None = None, strategy_slug: str | None = None, user_question: str | None = None) → ExplanationAgentOutput(text: str, model: str, prompt_tokens: int, completion_tokens: int, demo_mode: bool)`
- **Example invocation:**
  ```python
  agent = ExplanationAgent(db_session)
  out = agent.run(ExplanationAgentInput(op="report_run", run_id=42))
  ```
- **How to extend:** prompt builders live in `backend/agents/explanation_agent.py` next to the dispatch table. To add a new op, add a builder, register it, and route the new op through `backend/api/routes/explain.py`. The LLM call itself goes through `LLMProvider.generate(...)` — never bypass this.

---

## 3. Onboarding sequence for a new AI contributor

The following order produces the shallowest learning curve and the smallest risk of writing code that violates an invariant:

1. **`README.md`** — what the product is and how a human runs it locally.
2. **`CLAUDE.md`** — the terse decision-oriented guide; it lists the directory map, common commands, conventions, and "things to avoid". Most one-shot tasks require nothing beyond this.
3. **`ARCHITECTURE.md`** — the design rationale; read this before changing a seam between two agents or modifying the engine.
4. **`docs/agents.md`** + **`docs/strategies.md`** + **`docs/calendars.md`** + **`docs/data-sources.md`** — domain depth. Read the ones relevant to the change you're making.
5. **The test suite under `tests/`** — `pytest --collect-only` lists every test; pay special attention to `tests/test_engine_no_lookahead.py` (the oracle-strategy guard) and `tests/test_metrics_*` (KPI correctness).
6. **The specific file(s) your task touches**, plus the *callers* (one level of `grep` for the public symbol).

### Running the test suite

```bash
pytest                                        # whole backend
pytest tests/test_engine_no_lookahead.py      # the look-ahead-bias guard
pytest -k "metrics"                           # subset by keyword
ruff check backend/                           # linter
mypy backend/                                 # type checker
cd frontend && npm test                       # Vitest
cd frontend && npx tsc -b                     # type-check (noEmit)
```

Hooks must not be skipped (`--no-verify` is forbidden). If a hook fails, fix the cause; don't bypass it.

---

## 4. The non-negotiable invariants every AI contribution must respect

1. **Look-ahead bias is forbidden.** A strategy seeing bar `t`'s close cannot place an order that fills at bar `t`'s open or close. Orders placed during bar `t` fill at the **open of bar `t+1`**, with commission and slippage. This is enforced in `backend/backtest/engine.py` and asserted by an oracle strategy in `tests/test_engine_no_lookahead.py`. Do not add a code path that bypasses it.
2. **OHLCV DataFrame contract.** `{open, high, low, close, volume}`, `float64`, indexed by **tz-naive UTC `DatetimeIndex`**, sorted ascending, no duplicates.
3. **Strategy signal contract.** `generate_signals(bars) -> pd.Series[int]` aligned to `bars.index`, values in `{-1, 0, 1}`. Warm-up bars must be `0`.
4. **LLM calls only through `LLMProvider`.** Never `import openai`, `import anthropic`, `import google.generativeai`, or `import google.genai` anywhere outside `backend/llm/*_provider.py`.
5. **No live API calls inside a backtest.** The backtest reads only from the local DB. Fetching is a separate, scheduled concern handled by the Data agent.
6. **SQLAlchemy generic types only.** No `JSONB`, no `ARRAY`, no Postgres-specific functions — the schema runs on SQLite in dev and Postgres in prod from the same DDL.
7. **Structured logging via `structlog`.** No `print()` in backend code.
8. **No commits of frontend build artefacts.** `frontend/src/` contains `.ts`/`.tsx` only; CI workflow `check-no-build-artifacts.yml` enforces this on every PR.
9. **Hourly history horizon is ~730 days** (yfinance cap). Be defensive about this when you write code that takes a date range as input; users will pick longer windows.

If a task seems to require violating one of these invariants, **stop and surface the conflict** rather than working around it. The product's correctness depends on these.

---

## 5. Commit-message convention for AI contributions

Conventional-Commits-lite, as observed in the existing `git log`:

```
<type>: <short imperative summary, ≤72 chars>

<optional body — what & why, wrapped at 80 chars>

Co-Authored-By: <human name> <email>
Co-Authored-By: Claude <noreply@anthropic.com>
```

- **Type vocabulary:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`. Lowercase.
- **Always** include a `Co-Authored-By:` trailer for every AI-assisted commit, even when the human did the final keystrokes. The bot attribution is a courtesy to future maintainers reading `git blame` and a requirement of the [generative-AI acknowledgement](AI_USAGE.md) policy.
- **Never** pass `--no-verify`, `--no-gpg-sign`, or any other hook-skipping flag. If a pre-commit hook fails, the commit **did not happen** — fix the underlying issue, re-stage, and make a fresh commit. Do not `--amend` after a hook failure; it modifies the *previous* commit and can destroy work.
- **Squash on merge** is the default for feature PRs (preserves a clean linear history on `main`).
- **One logical change per commit.** A typo fix and an unrelated bug fix go in two commits.

---

## 6. PR etiquette for AI contributions

- **Small focused diffs.** A PR that touches one agent + its tests + its doc page is ideal. A PR that touches every file in the repo is a red flag.
- **Link the prompt.** In the PR body, paste (or summarise) the prompt that produced the change. This makes the change auditable and reproducible.
- **CI must pass before request-review.** The `claude-code-review.yml` workflow will run a `/code-review` pass on every push; treat its findings as actionable rather than informational. `check-no-build-artifacts.yml` fails the PR if any compiled JS/TS leaked into `frontend/src/`.
- **One human reviewer minimum** for code changes; docs-only changes can be self-merged for small typo fixes only.
- **Don't push directly to `main`** for code changes. Doc-only fixes (e.g. typo in `README.md`) are tolerated per observed repo practice but a PR is still preferred.

---

## 7. Where to put a new agent (if you really need one)

The bar for adding a seventh agent is high — first ask whether the new responsibility fits inside one of the existing six. If you genuinely need a new agent:

1. Create `backend/agents/<name>_agent.py`. Inherit from `BaseAgent[TIn, TOut]`.
2. Define Pydantic `Input` / `Output` models in the same file or in a sibling `schemas.py`.
3. Implement `_run(payload)`; do not override `run` (the base class wraps with timing + error mapping).
4. Add the agent to the orchestrator's tool table if the LLM should be able to invoke it.
5. Add a row to [`docs/agents.md`](docs/agents.md) describing the new agent + its public surface.
6. Add a corresponding §2.x block to this file.
7. Add `tests/test_<name>_agent.py` with at least the happy-path and one error-path test.

---

## 8. Cross-references

- [`CLAUDE.md`](CLAUDE.md) — the terse decision-grid for Claude Code in particular.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — full setup mechanics for human contributors.
- [`docs/agents.md`](docs/agents.md) — the internal architecture of the six runtime agents.
- [`docs/strategies.md`](docs/strategies.md) — the strategy catalogue.
- [`AI_USAGE.md`](AI_USAGE.md) — disclosure of every AI tool used by the team.
- [`CITATIONS.md`](CITATIONS.md) — third-party code and formulas.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — design rationale.

---

_Last verified against code: 2026-05-24._
