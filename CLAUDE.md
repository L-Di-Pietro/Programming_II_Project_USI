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
- **LLM:** Provider-agnostic abstraction with two implementations: `NullProvider` (default, deterministic, used by tests) and `GeminiProvider` (Google Gemini, fully wired — opt-in via `LLM_ENABLED=true` + `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`). `.env.example` ships with Gemini already selected.

---

## Common commands

```bash
# Backend
python -m venv .venv && source .venv/bin/activate   # Win: py -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                       # Win: Copy-Item .env.example .env
python scripts/init_db.py                  # create tables + seed assets
python scripts/load_initial_data.py --timeframes 1d 1h  # daily + hourly (bare command = daily only)
uvicorn backend.main:app --reload          # dev server on :8000
pytest                                     # run all backend tests
pytest tests/test_engine_no_lookahead.py   # critical look-ahead-bias guard
ruff check backend/                        # lint
mypy backend/                              # type-check
# Reset: delete quantbacktest.db* then re-run init_db + load_initial_data for a clean DB.

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

Every internal DataFrame of bars has these columns: `open`, `high`, `low`, `close`, `volume`. Indexed by **timezone-naive UTC `DatetimeIndex`**. Float64. Index frequency depends on the timeframe:

- **Daily (`"1d"`)**: index at midnight UTC, one row per native-calendar session.
- **Hourly (`"1h"`)**: NYSE bars at half-past hours inside the session (14:30, 15:30, …, 20:30 UTC in winter); crypto/FX at whole UTC hours.

Each asset class uses its **native trading calendar** — NYSE for equities/ETF, 24×5 (Sun 22:00 UTC → Fri 22:00 UTC) for FX, 24×7 for crypto. See `docs/calendars.md`. The cleaner applies a **bounded forward-fill** (≤ 2-bar gaps) for rare single-bar outages; longer outages survive as NaN and surface in `CleaningReport.gaps_remaining`, then are dropped from the final frame.

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

LLM calls go through `backend/llm/base.LLMProvider`. Never `import openai` / `import anthropic` / `import google.generativeai` (or `google.genai`) directly anywhere outside `backend/llm/*_provider.py`. To switch providers, change `LLM_PROVIDER` in `.env` — `LLMFactory.from_settings()` is the single dispatch point.

`backend/config.py` defaults to `LLM_ENABLED=false`, but `.env.example` ships with `LLM_ENABLED=true` and `LLM_PROVIDER=gemini`. So in a fresh checkout the answer to "is LLM on?" depends on whether the developer has copied `.env.example`. With a `GEMINI_API_KEY` set, the live Gemini path is active; without one, LLM endpoints fail loudly rather than fall back silently. Tests construct `NullProvider` directly so they're insensitive to env state.

---

## Things to avoid

- **Don't hit external data APIs from inside a backtest.** The backtest reads only from the local DB. Data fetching is a separate, scheduled concern.
- **Don't tune strategy parameters by repeatedly running the full backtest.** That's the canonical recipe for overfitting. Use the walk-forward split that's exposed in the strategy agent.
- **Don't add LLM calls outside the LLM agents.** Keep determinism elsewhere.
- **Don't use `pandas.read_csv` etc. as ad-hoc data sources** — go through a `BaseFetcher` so the lineage is recorded.
- **Don't use Postgres-only SQL.** Schema must run on SQLite.
- **Don't `print()` in backend code** — use `structlog`.
- **Don't write multi-paragraph docstrings.** One short sentence, then math/citations if needed.
- **Don't commit frontend build artifacts.** `frontend/src/` is `.ts`/`.tsx` only — compiled `.js`/`.jsx`/`.d.ts` (other than `vite-env.d.ts`) must never be tracked. Same for `frontend/vite.config.{js,d.ts}` and `frontend/tsconfig*.tsbuildinfo` at the `frontend/` root. The tsconfig is set up so `tsc -b` writes nothing into the source tree; if anything appears there, something is misconfigured. CI workflow `check-no-build-artifacts.yml` enforces this on every PR.

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
| Benchmark overlay missing or wrong | `backend/analytics/benchmarks.py` + `backend/agents/backtest_agent.py` (benchmark curves are computed and persisted at run time) |
| LLM endpoint returns demo text in production | `LLM_ENABLED`, `LLM_PROVIDER`, and `GEMINI_API_KEY` in `.env` — see [LLM](#llm) above |

---

## Open issues / TODOs visible in code

Search for `# TODO:` markers — most are tied to v1.1+ features (walk-forward UI, multi-run comparison, multi-asset portfolios).

## Sibling docs

- [`README.md`](README.md) — features, quick start, project layout
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — deep design rationale
- [`ONBOARDING.md`](ONBOARDING.md) — first-week orientation
- [`docs/strategies.md`](docs/strategies.md) — every shipped strategy with math and citations
- [`docs/agents.md`](docs/agents.md) — agent contracts and operations
- [`docs/calendars.md`](docs/calendars.md) — native calendars per asset class
- [`docs/data-sources.md`](docs/data-sources.md) — fetcher chains and quirks

---

_Last verified against code: 2026-05-24._
