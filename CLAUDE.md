# CLAUDE.md — Guide for Claude Code (and humans new to the repo)

This file is loaded by Claude Code on every session. Keep it terse, current, and decision-oriented. If you find yourself contradicting this file in conversation, update the file — don't just override it in chat.

---

## What this project is

A **web-based backtesting framework** for retail quantitative traders. Lets users test trading strategies on historical equities, FX, and crypto data, see standard performance metrics and charts, and (in a future iteration) get plain-language explanations from an LLM.

This is **Project 2.8** of the USI *Programming II* course — academic context, but built to a production-leaning standard.

---

## Stack at a glance

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.x, Pydantic v2
- **Database:** SQLite for local dev, Postgres-compatible schema for prod (`DATABASE_URL` switch)
- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS, Plotly.js for charts
- **Tests:** pytest (backend), Vitest (frontend)
- **LLM:** Provider-agnostic abstraction; v1 ships `NullProvider`, future iteration plugs in Google Gemini

---

## Common commands

```bash
# Backend
pip install -r requirements.txt
python scripts/init_db.py                  # create tables + seed assets
python scripts/load_initial_data.py        # bulk-fetch historical data
uvicorn backend.main:app --reload          # dev server on :8000
pytest                                     # run all backend tests
pytest tests/test_engine_no_lookahead.py   # critical look-ahead-bias guard
ruff check backend/                        # lint
mypy backend/                              # type-check

# Frontend
cd frontend && npm install
npm run dev                                # Vite dev server on :5173
npm test                                   # Vitest
npm run build                              # production build
```

---

## Directory map (what lives where)

| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app factory + lifespan |
| `backend/config.py` | Single source of truth for env-driven settings |
| `backend/database/models.py` | All SQLAlchemy tables — **the schema lives here** |
| `backend/database/connection.py` | Engine + `get_session()` dependency |
| `backend/agents/` | The 6 specialized agents |
| `backend/llm/` | LLMProvider abstraction (`base`, `null_provider`, `gemini_provider`) |
| `backend/data/fetchers/` | One file per data source (`equity_fetcher.py`, etc.) |
| `backend/data/cleaner.py` | OHLCV validation, gap fill, NYSE calendar reindex |
| `backend/strategies/` | One file per strategy + `base.py` ABC + registry in `__init__.py` |
| `backend/backtest/engine.py` | **The event loop** — look-ahead-bias is enforced here |
| `backend/backtest/{portfolio,execution,risk}.py` | Engine sub-modules |
| `backend/analytics/metrics.py` | All KPI formulas (CAGR, Sharpe, Sortino, ...) |
| `backend/analytics/visualizations.py` | Plotly figure builders |
| `backend/api/routes/` | FastAPI routers (`backtest.py`, `data.py`, `strategies.py`, `explain.py`) |
| `backend/api/schemas.py` | Pydantic request/response models — **the API contract lives here** |
| `frontend/src/api/client.ts` | Typed Axios client mirroring `schemas.py` |
| `frontend/src/components/` | Reusable UI primitives (charts, forms) |
| `frontend/src/pages/` | Top-level routes (Dashboard, NewBacktest, RunResults, Strategies) |
| `tests/` | pytest suite (look-ahead-bias guard, metrics correctness, strategy signals) |
| `scripts/` | One-shot maintenance scripts |
| `docs/` | Deep-dive docs (data sources, strategies, agents) |

---

## How to add a new strategy

1. Create `backend/strategies/<your_strategy>.py` with a class that inherits `BaseStrategy` and implements `generate_signals(bars: pd.DataFrame) -> pd.Series`.
2. Add it to the registry dict in `backend/strategies/__init__.py`.
3. Define its `params_schema` (JSON Schema) on the class — the frontend will auto-generate the config form from this.
4. Write a test in `tests/test_strategies.py` that asserts the signal series on a known fixture.
5. Add a row to `docs/strategies.md` describing the math and intuition.

That's it — the backtest engine, analytics, persistence, and UI all pick it up automatically.

---

## How to add a new asset class or data source

1. Subclass `BaseFetcher` in `backend/data/fetchers/<your_fetcher>.py` and implement `fetch(symbol, start, end) -> DataFrame`.
2. Wire it into the Data Agent's dispatch dict in `backend/agents/data_agent.py`.
3. Add representative symbols to `scripts/init_db.py`'s seed list.
4. Document the source's quirks in `docs/data-sources.md`.

---

## Conventions & invariants

### Look-ahead bias is a critical bug

The single most important rule: **a strategy seeing bar `t`'s close cannot place an order that fills at bar `t`'s open or close.** Orders placed during bar `t` fill at the **open of bar `t+1`**.

This is enforced in `backend/backtest/engine.py`. **Do not** add a path that bypasses it (e.g. "fill at current bar's close"). If a strategy needs intra-bar fills, that's a future intraday-data feature, not a daily-bar shortcut.

The test `tests/test_engine_no_lookahead.py` asserts this property by injecting an oracle strategy that "knows" the future close — the engine must still only let it trade at next-bar open.

### OHLCV DataFrame contract

Every internal DataFrame of bars has these columns: `open`, `high`, `low`, `close`, `volume`. Indexed by **timezone-naive UTC `DatetimeIndex`**. Float64. No missing values inside the date range — `cleaner.py` is responsible for filling or rejecting gaps before storage.

### Strategy signal contract

`generate_signals(bars)` returns a `pd.Series[int]` aligned to the input index, with values in `{-1, 0, 1}`:

- `1` = target long position
- `0` = target flat
- `-1` = target short (only used by short-capable strategies)

The signal at index `t` is what the strategy *wants* its position to be after processing bar `t`. The engine handles the t→t+1 fill, position sizing, commissions, and slippage.

### Database

- SQLite in dev, Postgres in prod — use **only SQLAlchemy generic types**. No `JSONB`, no `ARRAY`, no Postgres-specific functions.
- Composite primary keys via `PrimaryKeyConstraint`, not `__table_args__` magic.
- All `DateTime` columns are stored as **timezone-naive UTC**.

### Logging

`backend/config.py` configures structured logging via `structlog`. Use module-level loggers (`log = structlog.get_logger(__name__)`); don't `print()`.

### LLM

LLM calls go through `backend/llm/base.LLMProvider`. Never `import openai` / `import anthropic` / `import google.generativeai` directly anywhere outside `backend/llm/*_provider.py`. To switch providers, change `LLM_PROVIDER` in `.env`.

In v1, `LLM_ENABLED=false` by default; the Explanation Agent uses `NullProvider` which returns deterministic canned strings. Tests rely on this.

---

## Things to avoid

- **Don't hit external data APIs from inside a backtest.** The backtest reads only from the local DB. Data fetching is a separate, scheduled concern.
- **Don't tune strategy parameters by repeatedly running the full backtest.** That's the canonical recipe for overfitting. Use the walk-forward split that's exposed in the strategy agent.
- **Don't add LLM calls outside the LLM agents.** Keep determinism elsewhere.
- **Don't use `pandas.read_csv` etc. as ad-hoc data sources** — go through a `BaseFetcher` so the lineage is recorded.
- **Don't use Postgres-only SQL.** Schema must run on SQLite.
- **Don't `print()` in backend code** — use `structlog`.
- **Don't write multi-paragraph docstrings.** One short sentence, then math/citations if needed.

---

## Where to look first when debugging

| Symptom | First file to open |
|---|---|
| Strategy returns nonsense signals | `backend/strategies/<that_strategy>.py` and its test |
| KPIs look wrong | `backend/analytics/metrics.py` (each function has a docstring with the formula) |
| Backtest crashes mid-loop | `backend/backtest/engine.py` |
| Data fetch fails | `backend/data/fetchers/<source>.py` and `docs/data-sources.md` |
| API returns 500 | check the relevant router in `backend/api/routes/` and the schema in `backend/api/schemas.py` |
| Frontend can't reach backend | `frontend/vite.config.ts` (dev proxy) |
| Charts look empty | `backend/analytics/visualizations.py` (chart payload builders) |

---

## Open issues / TODOs visible in code

Search for `# TODO:` markers — most are tied to v1.1+ features (LLM activation, walk-forward UI, multi-asset portfolios).
