# Nightly Documentation Refresh — Headless Session

You are running **headless on a GitHub Actions runner, with no human in the loop**.
This is the automated nightly documentation refresh for **Project 2.8 — Backtesting
Framework for Quantitative Strategies** (USI *Programming in Finance II*, 2026).
It is triggered by `.github/workflows/nightly-docs.yml` at 02:00 UTC. Your edits are
**not** pushed to `main`; the workflow opens a pull request from whatever you change.

## Repository state (ground truth)

- Backend: Python 3.11 / FastAPI / SQLAlchemy 2.x / Pydantic v2. Frontend: React 18 +
  TypeScript + Vite + Tailwind, Plotly.js charts. Tests: pytest (backend) + Vitest.
- 11 strategies (`backend/strategies/`), 6 agents (`backend/agents/`), 4 API routers
  (`backend/api/routes/`), 4 frontend pages (`frontend/src/pages/`).
- LLM is provider-agnostic (`backend/llm/`): `NullProvider` (default/tests) and
  `GeminiProvider` (opt-in). Look-ahead bias is enforced in `backend/backtest/engine.py`.
- All standard docs are CURRENT as of the last refresh. Your job is to keep them that
  way — edit only what has actually drifted; never rewrite a doc from scratch.

## What to do

1. Find what changed in the last 24h:
   `git log --since="24 hours ago" --name-only --pretty=format:"%h %an %s"`
   If there are **no** commits in that window: make no edits, leave the working tree
   clean, and stop. The workflow detects the empty diff and skips the PR.

2. **Do these two mandatory updates first** (whenever there was ≥1 commit in the window),
   so the highest-value docs are done even if you run long:
   - `CHANGELOG.md` — add/extend the entry covering the last 24h of commits.
   - `docs/academic/02_project_diary.tex` — add a dated diary entry for the same.

3. Then, for each changed file, decide whether any of these docs are now stale, and edit
   only the stale ones: `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `ONBOARDING.md`,
   `AGENTS.md`, `docs/agents.md`, `docs/strategies.md`, `docs/calendars.md`,
   `docs/data-sources.md`, `docs/user-guide.md`, `docs/api.md`. Map by area, e.g.:
   - `backend/strategies/*` → `docs/strategies.md` (+ strategy count in `README.md`/`CLAUDE.md`)
   - `backend/agents/*` → `docs/agents.md`, `AGENTS.md`
   - `backend/api/routes/*`, `backend/api/schemas.py` → `docs/api.md`
   - `backend/data/fetchers/*`, `backend/data/cleaner.py` → `docs/data-sources.md`, `docs/calendars.md`
   - `frontend/src/**` → `docs/user-guide.md`, `README.md`
   - workflows / config → `CLAUDE.md` (Automation / commands), `ONBOARDING.md`

4. **Never** modify code, tests, configuration, CI workflows, schemas, `requirements.txt`,
   or `package.json`. Documentation files only.

5. **Never** rewrite a doc wholesale. Make surgical edits to the stale parts; preserve
   the existing voice, structure, and formatting.

6. Before finishing, run `git diff` on your own edits and sanity-check them: facts correct,
   no broken Markdown/LaTeX, no accidental non-doc edits.

7. If after all this nothing needs changing, leave the working tree clean and stop.

You may use: Read, Grep, Edit, Write, and a restricted, read-only Bash set
(`git log`, `git diff`, `git status`, `pytest --collect-only`, `npm --version`).
You cannot commit or push — that is the workflow's job.

**Work within a bounded turn budget.** You have a limited number of agent turns, so spend
them on edits, not overhead: don't re-read a file you've already read, and do **not** run
`pytest --collect-only` or `npm --version` unless you specifically need to verify a fact
for a doc. Batch related edits. If you cannot finish everything, make sure the two
mandatory updates (step 2) and the docs for the most-affected areas are complete first.

---

UNLESS IT'S STRICTLY NECESSARY, DO NOT MODIFY ANY OTHER FILE FOR THE MOMENT. IF YOU THINK
THAT ANY OTHER FILE IN THE REPO NEEDS A CHANGE RIGHT NOW ASK ME BEFORE DOING ANYTHING.

Don't worry about Token limits because we want to make sure we have the best plan/prompts
to execute. Give me your best effort.
