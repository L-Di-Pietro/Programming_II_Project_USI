# Changelog

All notable changes to **QuantBacktest** are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). The repository carries no Git tags yet — this file treats the state at the *USI Programming II Project 2.8* submission (2026-05-24) as the first release candidate, **v1.0.0-rc1**, and groups prior work into weekly pre-release blocks so the academic project diary can cite specific commits.

Hash references use the short SHA (e.g. `abcdef1`); resolve them with `git show <sha>`.

---

## [Unreleased]

### CI

- **Nightly documentation-refresh workflow** (`nightly-docs.yml`) — Claude Code runs
  headless at 02:00 UTC each night, reads the last 24 h of commits, and opens a pull
  request with any stale doc updates. Auth via `CLAUDE_CODE_OAUTH_TOKEN` (PR \#9,
  `612e39e`, `4dfc948`). `id-token: write` permission added after initial OIDC failure
  (PR \#10, `58a4811`).

---

## [v1.0.0-rc1] — 2026-05-24 — *USI Programming II submission*

This is the state of the codebase as submitted to iCorsi for Project 2.8 (Spring 2026). It bundles four weeks of development across four contributors. The feature set is described in [`README.md`](README.md) and the design rationale in [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Added

- **11 trading strategies** across five families (trend, momentum, breakout, mean-reversion, benchmark), with auto-generated UI parameter forms driven by Pydantic `Config` classes; see [`docs/strategies.md`](docs/strategies.md). The six strategies added on top of the original five (MACD, Ichimoku, Keltner, Time Series Momentum, Stochastic, CCI) shipped in `b0676ed`.
- **Six-agent backend architecture** (Orchestrator, Data, Strategy, Backtest, Analytics, Explanation), all inheriting `BaseAgent[TIn, TOut]`; see [`docs/agents.md`](docs/agents.md).
- **Event-driven backtest engine** with strict bar-`t` → bar-`t+1` fill semantics enforced in `backend/backtest/engine.py` and asserted by an oracle strategy in `tests/test_engine_no_lookahead.py`.
- **Asset universe**: 20 US mega-caps, 5 ETFs, 5 crypto pairs, 6 FX pairs; full list in [`docs/data-sources.md`](docs/data-sources.md). TSLA added in `376d30e`; the bulk of the universe added in `e3ae698`.
- **Multi-timeframe bars** (daily *and* hourly) with composite primary key `(asset_id, ts, timeframe)` and per-asset-class native trading calendars (NYSE for equities/ETFs, 24×5 for FX, 24×7 for crypto); see `1f13139` and [`docs/calendars.md`](docs/calendars.md).
- **Benchmark overlays**: same-asset buy-and-hold and SPY buy-and-hold curves computed and persisted at run time so the UI can draw overlays without recomputation (`be6cf8a`, `c0801c7`, `55fa4b0`).
- **Shared crosshair tooltip** across all charts so values stay aligned when the mouse hovers anywhere on the timeline (`d432105`).
- **Shared chart legend** that toggles strategy / asset-B&H / SPY-B&H lines across every figure (`55fa4b0`).
- **One-click PDF export** of the AI-generated report from the results page, using `jsPDF` (`0a7edb1`).
- **Backtest loading UI** (run-progress indicator) replacing the original feature-card teaser on the Dashboard (`425fa47`).
- **LLM provider abstraction** (`backend/llm/base.py`) with two implementations — `NullProvider` (default, deterministic) and `GeminiProvider` (Google Gemini, opt-in via `LLM_ENABLED=true` + `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`). LLM-generated report feature shipped in `8997d20`; retries hardened in `a3b6635`.
- **APScheduler nightly data refresh** at the configured UTC hour (`backend/main.py` lifespan hook).
- **CORS middleware** permissive in dev; meant to be tightened for production (`backend/main.py`).
- **`GET /healthz`** endpoint returning service status + LLM-enabled flag (`backend/main.py:126`).
- **Pydantic v2 schemas** for every API request/response, doubling as the OpenAPI contract.
- **Strategy registry** keyed by slug in `backend/strategies/__init__.py`; UI dropdown order follows registry order intentionally.

### Changed

- **yfinance promoted to primary data source for crypto** (was Binance/ccxt); ccxt retained as fallback for older crypto hourly bars (`c2b6cce`).
- **Strategy `category` field** added to API output so the UI can group strategies by family (`3e22d4c`).
- **Chart fixes** across the suite: gradient fills, axis labels, hover tooltips (`162ceba`, `d432105`).
- **Sidebar navigation** replaced earlier top-bar nav (`ab1e2de`).
- **Backtest summaries** now include strategy name + asset symbol so the Dashboard list can render meaningfully without joining client-side (`cee56a9`).
- **Frontend** pruned, CSS tightened, hourly-fetch check fixed (`dc3e456`).
- **Fixed-fractional sizing** corrected for crypto and FX where the asset price is non-USD (`ae082ef`).
- **DB upserts** chunked to stay under SQLite's `SQLITE_MAX_VARIABLE_NUMBER` for large bulk loads (`a3b6635`).
- **`.env.example`** updated to ship with Gemini selected by default (`1bc4667`) — see also [`docs/agents.md`](docs/agents.md)'s note on `LLM_ENABLED`.
- **Local setup and quick-start docs** improved for first-time contributors (`d1efa3f`).
- **`yfinance` bumped** from 0.2.46 to 1.3.0; `httpx` bumped to 0.28.1; `curl_cffi` 0.15.0 added (`4a9e6ae`).

### Fixed

- **Time-index alignment** between strategy signals and engine fills (`a3b6635`); regression risk now covered by `tests/test_engine_no_lookahead.py`.
- **TypeScript compile leakage**: `tsc -b` no longer writes anything into `frontend/src/`; metadata redirected to `node_modules/` (`4ce0311`, `820d610`).
- **Stale `.tsbuildinfo`** files untracked (`820d610`).
- **`.gitignore`**: SQLite DB files no longer accidentally committed (`e25ddfd`, `399f763`).

### Docs

- **Strategy catalogue** rewritten with one block per strategy: math, parameters, "wins in / loses in", citation (`79e200a`).
- **Architecture deep-dive** (`ARCHITECTURE.md`) refreshed against the current six-agent layout (`79e200a`).
- **`CLAUDE.md`** rewritten as a terse decision-grid for AI-assisted contributors (`79e200a`).
- **`ONBOARDING.md`** added for first-week orientation (`79e200a`).
- **`docs/agents.md`**, **`docs/calendars.md`**, **`docs/data-sources.md`** added for technical depth (`79e200a`).
- **This file (`CHANGELOG.md`)** and the AI-collaboration contract (`AGENTS.md`), user guide (`docs/user-guide.md`), HTTP API reference (`docs/api.md`), citations (`CITATIONS.md`), AI-tool acknowledgement (`AI_USAGE.md`), security policy (`SECURITY.md`), code of conduct (`CODE_OF_CONDUCT.md`), architecture diagrams (`docs/architecture-diagrams/`), and the LaTeX academic submission bundle (`docs/academic/`) added on 2026-05-24 as part of the project-submission documentation pass.

### CI

- **Claude PR Assistant workflow** (`claude.yml`) — answers `@claude` mentions on issues, PRs, and review comments (`3d50b41`).
- **Claude Code Review workflow** (`claude-code-review.yml`) — runs the `/code-review` plugin on every PR (`6a38f60`).
- **Build-artifact hygiene workflow** (`check-no-build-artifacts.yml`) — fails the PR if any compiled JS/TS leaks into `frontend/src/` or if stray `.d.ts` / `vite.config.{js,d.ts}` / `.tsbuildinfo` appears (`4ce0311`, `820d610`).

### Security

- LLM features are **opt-in** (`LLM_ENABLED=false` is the in-code default). The app does not transmit user data anywhere unless the user explicitly enables an LLM provider and supplies an API key.
- No credentials are committed (`.env` is gitignored; only `.env.example` ships as schema-of-record).

---

## [Pre-release timeline]

The work that produced **v1.0.0-rc1** is organised here by week so the academic project diary in [`docs/academic/02_project_diary.tex`](docs/academic/02_project_diary.tex) can cite specific milestones.

### Week of 2026-04-27 — *Foundation*

- `2026-04-25 4ff85c1` Initial commit (Luca Di Pietro).
- `2026-04-29 ecdf3bb` Initial project scaffold for QuantBacktest (Luca Di Pietro). Backend skeleton, project layout, baseline `requirements.txt`.

### Week of 2026-05-04 — *First domain feature + LLM report*

- `2026-05-08 376d30e` feat: add TSLA (Tesla) as new equity asset (Stefano Angelo Galdini; merged via PR #1).
- `2026-05-08 8997d20` feat: add LLM generated report (Filippo Selmi). First end-to-end Explanation Agent invocation.

### Week of 2026-05-11 — *Frontend MVP + hourly bars + chart polish*

- `2026-05-12 1f2f5c7` Frontend Version 1 (Baumender11).
- `2026-05-12 1f13139` Add native calendars and hourly bar support (Luca Di Pietro; merged via PR #2). Composite-key OHLCV, NYSE/24×5/24×7 calendars wired through the cleaner.
- `2026-05-12 3e22d4c` The strategy category fix (Baumender11).
- `2026-05-12 162ceba` Fixing Charts (Baumender11).
- `2026-05-12 ab1e2de` Sidebar Navigation (Baumender11).
- `2026-05-13 a3b6635` Chunk upserts, add LLM retries, and fix time indexes (Luca Di Pietro).

### Week of 2026-05-15 — *Polish + PDF export + CI*

- `2026-05-15 dc3e456` Prune frontend, tweak CSS, fix hourly fetch check (Luca Di Pietro).
- `2026-05-16 0a7edb1` Add Download PDF for AI generated report (Filippo Selmi).
- `2026-05-19 3d50b41` Claude PR Assistant workflow (Luca Di Pietro; merged via PR #3).
- `2026-05-19 6a38f60` Claude Code Review workflow (Luca Di Pietro).

### Week of 2026-05-18 — *Build hygiene, data layer, strategy expansion, benchmarks, docs*

- `2026-05-20 4ce0311` Prevent tsc emissions from being committed under `frontend/src/` (Luca Di Pietro; merged via PR #4).
- `2026-05-20 820d610` Untrack stale `.tsbuildinfo` files and redirect all tsc metadata to `node_modules` (Luca Di Pietro).
- `2026-05-20 c2b6cce` Make yfinance primary source for crypto data (Filippo Selmi; merged via PR #5).
- `2026-05-20 e25ddfd` Ignore SQLite DB files in `.gitignore` (Luca Di Pietro).
- `2026-05-20 ae082ef` Fixed Fractional sizing for crypto and FX (Baumender11; merged via PR #6).
- `2026-05-21 1bc4667` update `.env.example` (Stefano Angelo Galdini).
- `2026-05-21 e3ae698` Added more securities — 16 stocks, 4 ETFs, 4 crypto, 5 FX pairs (Stefano Angelo Galdini).
- `2026-05-21 b0676ed` added 6 new strategies — MACD, Ichimoku, Keltner, TSM, Stochastic, CCI (Stefano Angelo Galdini; merged via PR #7).
- `2026-05-21 425fa47` Add backtest loading UI; remove feature cards (Baumender11).
- `2026-05-21 cee56a9` Include strategy name and asset symbol in backtests (Baumender11).
- `2026-05-21 be6cf8a` Add buy-and-hold & SPY benchmark overlays (Filippo Selmi).
- `2026-05-22 c0801c7` Support benchmark overlays (API + UI) (Luca Di Pietro; merged via PR #8).
- `2026-05-22 55fa4b0` Add shared chart legend and benchmark overlays (Luca Di Pietro).
- `2026-05-22 d432105` Add shared crosshair tooltip & chart hover (Luca Di Pietro).
- `2026-05-22 d1efa3f` Improve local setup and quick-start docs (Luca Di Pietro).
- `2026-05-22 4a9e6ae` Bump yfinance and httpx; add curl_cffi (Luca Di Pietro).

### Week of 2026-05-25 — *Documentation pass*

- `2026-05-24 399f763` Update `.gitignore` (Stefano Angelo Galdini).
- `2026-05-24 79e200a` Updated all the current documentation files (Stefano Angelo Galdini). Existing docs (`README`, `ARCHITECTURE`, `CLAUDE`, `ONBOARDING`, `docs/{agents,calendars,data-sources,strategies}.md`) brought in line with the current code.
- `2026-05-24` — new documentation artefacts created for the iCorsi submission (this commit batch): `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CITATIONS.md`, `AI_USAGE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `docs/user-guide.md`, `docs/api.md`, `docs/architecture-diagrams/`, `docs/academic/*` (LaTeX bundle).
- `2026-05-24 612e39e` Nightly headless docs-refresh workflow (`nightly-docs.yml`) added; merged as PR \#9 (Luca Di Pietro).
- `2026-05-24 4dfc948` CI: authenticate nightly docs via `CLAUDE_CODE_OAUTH_TOKEN` (Luca Di Pietro).
- `2026-05-24 58a4811` CI: grant `id-token: write` so `claude-code-action` can run; merged as PR \#10 (Luca Di Pietro).

---

## Contributors (this release)

| Contributor | Real name | GitHub handle | Commits (non-merge) |
|---|---|---|---|
| Aaron Arauz | Aaron Arauz | `Baumender11` | 7 |
| Luca Di Pietro | Luca Di Pietro | `L-Di-Pietro` | 15 |
| Stefano Angelo Galdini | Stefano Angelo Galdini | *(commits under real name; no separate handle)* | 6 |
| Filippo Selmi | Filippo Selmi | `FilippoSelmi` (also seen as `selmif`) | 4 |

GitHub Copilot's bot account (`copilot-swe-agent[bot]`) appears in a single merge-resolution commit and is **not** a project contributor; see [`AI_USAGE.md`](AI_USAGE.md).

---

_Last verified against code: 2026-05-24._
