# Contributing to QuantEdge

Thanks for thinking about contributing. This document is the single source of truth for the *mechanics* of contributing: branch model, commit-message convention, how to run the tests, how to add a new strategy / data fetcher / agent, and what we expect from a PR. The *rules of the road* for AI contributors (Claude Code, GitHub Copilot, ChatGPT, Cursor, Gemini, …) are in [`AGENTS.md`](AGENTS.md) — read both.

QuantEdge is an academic project (USI Lugano, *Programming in Finance II*, Project 2.8, Spring 2026). The code targets *production-leaning quality* under an academic deadline. We accept contributions that increase that quality and decline contributions that trade it away for cleverness.

---

## TL;DR — the five-minute version

1. Fork or branch off `main`.
2. Read [`CLAUDE.md`](CLAUDE.md) — terse decision-grid for the whole repo.
3. Make your change in the smallest scope possible.
4. Run `pytest`, `ruff check backend/`, `mypy backend/`, `cd frontend && npm test && npx tsc -b`.
5. Open a PR. Wait for `claude-code-review` and `check-no-build-artifacts` to pass. Request a human reviewer.
6. Squash-merge on green review.

---

## Branch model

We use **trunk-based development with feature branches**:

- `main` is always shippable. CI passes; the dev server starts cleanly.
- **Feature branches** are short-lived (hours-to-days) and named descriptively: `feat/walk-forward-ui`, `fix/yfinance-rate-limit`, `docs/strategy-catalogue-update`. Avoid generic names like `dev`, `wip`, `temp`.
- **Pull requests** target `main`. Squash-merge is the default; rebase-merge is acceptable when a series of intentional commits tells the story.
- **Direct pushes to `main`** are tolerated *only* for trivial docs-only changes (typo fixes). For code, always PR. This mirrors the observed practice in `git log` since the project started.

We work directly off `main` rather than maintaining a long-lived `dev` branch because the team is small (four contributors) and the project lifecycle (four weeks of development) didn't justify the overhead.

---

## Setting up your environment

The canonical Quick Start lives in [`README.md`](README.md#quick-start). The short version:

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scripts/init_db.py
python scripts/load_initial_data.py --timeframes 1d 1h    # optional; loads market data
uvicorn backend.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

If you only need backend or only need frontend, skip the other half — neither is a hard dependency of the other for unit testing.

---

## Running the tests, linters, and type checkers

| Command | What it does | When to run |
|---|---|---|
| `pytest` | Whole backend test suite. | Before every commit that touches `backend/`. |
| `pytest tests/test_engine_no_lookahead.py` | The look-ahead-bias oracle test. | Every time you touch `backend/backtest/`. |
| `pytest -k metrics` | KPI correctness tests. | Every time you touch `backend/analytics/metrics.py`. |
| `pytest --cov=backend --cov-report=term-missing` | Coverage report. | Before opening a PR that adds new modules. |
| `ruff check backend/` | Lint (and autofix with `--fix`). | Before every commit. |
| `mypy backend/` | Static type-check. | Before every commit that changes function signatures or model fields. |
| `cd frontend && npm test` | Vitest (frontend unit tests). | Before every commit that touches `frontend/`. |
| `cd frontend && npx tsc -b` | TypeScript type-check (no emit). | Before every commit that touches `.ts`/`.tsx`. |

`pre-commit` hooks are not yet configured; running these commands manually is the team norm.

---

## Commit-message convention

We use **Conventional-Commits-lite**:

```
<type>: <short imperative summary, ≤72 chars>

<optional body — what & why, wrapped at 80 chars>

Co-Authored-By: <human name> <email>
Co-Authored-By: Claude <noreply@anthropic.com>     # only when an AI tool contributed
```

- **Type vocabulary:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`. Lowercase.
- **Always** include a `Co-Authored-By:` trailer for the human contributors who wrote or reviewed the code.
- **Always** include a `Co-Authored-By:` trailer naming the AI tool whenever an AI tool produced more than a trivial suggestion. This is a requirement of the [generative-AI acknowledgement policy](AI_USAGE.md).
- **Never** pass `--no-verify` or `--no-gpg-sign` to `git commit`. If a hook fails, fix the cause and re-commit.
- **Never** `--amend` after a pre-commit hook fails. The hook failure means the commit did *not* happen, so amending modifies the *previous* commit and can destroy work. Make a fresh commit instead.
- **One logical change per commit.** Mixing a typo fix and an unrelated feature in the same commit makes `git blame` and `git revert` lose value.

Good subjects (copied from real history):

- `feat: add TSLA (Tesla) as new equity asset`
- `fix: prevent tsc emissions from being committed under frontend/src/`
- `docs: update local setup and quick-start docs`

---

## How to add a new …

Each of these is a short pointer; the *real* instructions live in [`CLAUDE.md`](CLAUDE.md).

### …strategy

1. Create `backend/strategies/<your_strategy>.py`. Inherit from `BaseStrategy`.
2. Define a Pydantic `Config` class — this auto-generates the JSON Schema that drives the frontend parameter form.
3. Implement `generate_signals(bars: pd.DataFrame) -> pd.Series[int]` returning values in `{-1, 0, 1}`.
4. Register it in `backend/strategies/__init__.py`'s `STRATEGY_REGISTRY`.
5. Add a unit test in `tests/test_strategies.py` asserting the signal series on a known fixture.
6. Add a section to [`docs/strategies.md`](docs/strategies.md): math, parameters, "wins in / loses in", citation.

Full version with worked examples: [`CLAUDE.md#how-to-add-a-new-strategy`](CLAUDE.md).

### …data source / asset class

1. Subclass `BaseFetcher` in `backend/data/fetchers/<your_fetcher>.py`.
2. Wire it into `_FETCHERS` (and `_CALENDAR_FOR` if it's a new asset class) inside `backend/agents/data_agent.py`.
3. Add representative symbols to `scripts/init_db.py`'s seed list.
4. Document the source's quirks (rate limits, data quality, history horizon) in [`docs/data-sources.md`](docs/data-sources.md).

Full version: [`CLAUDE.md#how-to-add-a-new-asset-class-or-data-source`](CLAUDE.md).

### …agent

The bar is high — first ask whether the new responsibility fits inside one of the existing six (Orchestrator, Data, Strategy, Backtest, Analytics, Explanation). If you genuinely need a seventh:

1. `backend/agents/<name>_agent.py`, inheriting from `BaseAgent[TIn, TOut]`.
2. Define Pydantic `Input` and `Output` models.
3. Implement `_run(payload)`. Never override `run`.
4. Register with the orchestrator's tool table if the LLM should be able to call it.
5. Add a `tests/test_<name>_agent.py` with at least a happy-path and one error-path test.
6. Add a section to [`docs/agents.md`](docs/agents.md) and to [`AGENTS.md`](AGENTS.md#7-where-to-put-a-new-agent-if-you-really-need-one).

### …chart

1. Add the figure builder to `backend/analytics/visualizations.py` returning a Plotly figure dict.
2. Add the new `chart_kind` literal to `AnalyticsAgentInput`.
3. Add a frontend component under `frontend/src/components/` consuming the existing `GET /backtests/{run_id}/charts/{kind}` endpoint.
4. Add a test fixture in `tests/test_visualizations.py` asserting the figure structure.

### …KPI

1. Add the function to `backend/analytics/metrics.py` with a one-sentence docstring stating the formula and citing the source.
2. Persist it as a `Metric` row in the `metrics` table (no DDL change needed — the table is long-format).
3. Add a unit test in `tests/test_metrics.py` asserting the value on a known fixture.
4. Add a row to [`CITATIONS.md`](CITATIONS.md) under "Algorithms & formulas".

---

## Code-review expectations

A PR is ready for review when:

- ✅ `claude-code-review.yml` workflow has run and findings have been addressed.
- ✅ `check-no-build-artifacts.yml` is green (no compiled JS/TS in `frontend/src/`, no stray `.d.ts`).
- ✅ `pytest`, `ruff`, `mypy`, `vitest`, `tsc -b` all pass locally.
- ✅ The PR body explains *why* (not just *what*), and links the prompt if an AI tool contributed.
- ✅ The diff is scoped to one logical change.

Reviewers check:

- **Correctness invariants** — does the change preserve the look-ahead-bias guarantee, the `{-1, 0, 1}` signal contract, the OHLCV DataFrame contract, the LLM-only-through-`LLMProvider` rule, SQLite/Postgres portability?
- **Test coverage** — are new code paths exercised by tests?
- **Documentation** — does the change update the relevant `docs/*.md` file?
- **No dead code, no half-finished refactors, no speculative abstractions.**

A reviewer who approves a PR takes joint responsibility for it. Approve only what you've actually read.

---

## AI contributions

See [`AGENTS.md`](AGENTS.md) for the full contract. The non-negotiables:

- AI tools are **collaborators**, not authors. A human reviews every line that lands in `main`.
- Every commit with non-trivial AI contribution carries a `Co-Authored-By:` trailer naming the tool.
- AI tools are **never** given access to credentials or production data.
- The LLM features inside the product itself are **opt-in** (`LLM_ENABLED=false` is the in-code default) — see [`backend/config.py`](backend/config.py).

---

## Asking for help

- **Found a bug?** Open a GitHub Issue with a minimal reproducer.
- **Have a security concern?** See [`SECURITY.md`](SECURITY.md).
- **Want to discuss design?** Tag a maintainer on a draft PR; we prefer to argue over diffs rather than over abstractions.

---

## Code of Conduct

Contributors are expected to follow the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).

---

_Last verified against code: 2026-05-24._
