# Changelog

All notable changes to **QuantEdge** are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). The repository carries no Git tags yet — this file treats the state at the *USI Programming II Project 2.8* submission (2026-05-24) as the first release candidate, **v1.0.0-rc1**, and groups prior work into weekly pre-release blocks so the academic project diary can cite specific commits.

Hash references use the short SHA (e.g. `abcdef1`); resolve them with `git show <sha>`.

---

## [Unreleased]

### Added

- **`MobileDesktopBanner` component and `useIsMobile` hook** (`7ca67e8`) —
  `MobileDesktopBanner` is shown only on viewports narrower than the desktop
  breakpoint (`lg`, 1024 px); it lists the three headline features and directs
  mobile users to open the app on a larger screen. The companion `useIsMobile`
  hook mirrors the single breakpoint already used by `MobileNav`. The onboarding
  tour and the SideNav "Replay tutorial" button are both suppressed on mobile so
  the tour does not compete with the banner.
- **Mobile-responsive navigation** (`b9414a7`) — `MobileNav` component provides a
  drawer + fixed top bar for phone/tablet layouts with safe-area inset support and
  touch-friendly targets; `SideNav` extracted as a standalone component;
  `ScrollHint` wraps horizontally scrollable tables and heatmaps to prevent
  overflow. Charts (equity curve, drawdown, rolling Sharpe), `MetricsPanel`,
  `TradeList`, `AIAnalystModal`, `ConfigPopover`, and `DateField` all adapted for
  mobile viewports; `viewport-fit=cover` meta added to `index.html`.
- **Production Dockerfiles** — `Dockerfile` (backend, Railway-compatible `exec`-form
  CMD so `$PORT` expands at runtime) and `frontend/Dockerfile.prod` (multi-stage Vite
  build served with SPA fallback; `VITE_API_URL` baked at build time).
  `frontend/.dockerignore` added (`e1dd918`).
- **`psycopg[binary]`** added to `requirements.txt` for production Postgres
  connectivity (`e1dd918`).
- **Onboarding tour** (`b3acd7d`) — `OnboardingTour` component spotlights one UI
  element per step; *active* steps ask the user to click the highlighted control
  before advancing, teaching by doing rather than by reading. Replayable via a
  "Replay tour" footer link. No third-party tour library.
- **PipelineLoadingScreen** (`a7ffe1c`) — shared animated pipeline-progress loader
  replacing the per-page ad-hoc spinners on NewBacktest, RunResults, and Strategies.
- **IBM Plex font bundle** (`38816c3`) — self-hosted WOFF2 files (Mono/Sans/Serif)
  with a `plex.ts` loader; used by `exportReportHtml` so offline reports carry their
  own fonts.
- **HTML report download** (`fd57ede`) — AI Analyst modal now exports an interactive
  self-contained HTML report via `exportReportHtml`, replacing the earlier PDF option;
  the same export also powers the Dashboard runs-table download button.
- **`exportReportHtml` utility** (`38816c3`) — produces a standalone HTML file that
  inlines Plotly and the IBM Plex font bundle; no backend round-trip.
- **Anonymous per-browser `client_id`** (`1acc780`) — `frontend/src/api/clientId.ts`
  generates a persistent UUID in `localStorage`; an Axios interceptor forwards it as
  `X-Client-Id` on every request so backtest history is scoped to the originating
  browser.
- **True PDF export via headless Chromium** (`b7996f6`, PR \#21) — new
  `POST /backtests/{run_id}/report.pdf` endpoint accepts the client-assembled HTML
  report (produced by `exportReportHtml` in `"pdf"` mode) and renders it to a
  print-quality A4 PDF using Playwright's sync API. Because the same browser engine
  that displays the interactive report also renders the PDF, charts, fonts, and layout
  are pixel-identical. `backend/analytics/report_pdf_render.py` encapsulates the
  Playwright logic; `playwright==1.49.0` added to `requirements.txt`; the `Dockerfile`
  updated to install the Chromium bundle for Railway deployments.
- **`PdfSectionsDialog` component** (`b7996f6`) — modal that lets the user choose
  which report sections to include before the Chromium PDF render is triggered.

### Changed

- **Project rebranded from QuantBacktest to QuantEdge** (`da11eaf`) —
  All occurrences of the old name replaced in documentation, configuration,
  frontend, and backend files; `frontend/index.html` title, `pyproject.toml`
  package name, `docker-compose.yml` service names, academic LaTeX bundle, and
  all Markdown docs updated in a single pass.
- **`run.py` port check moved to start of `main()`** (`a0b8ac2`) — port
  availability for `:8000` and `:5173` is now validated immediately after the
  Python/Node version check, before venv creation, dependency installation, or
  any interactive prompt; the duplicate check that had been placed later in the
  startup sequence is removed. A top-level execution-order comment documents the
  seven startup phases.
- **`exportReportHtml` print path hardened** (`1ebcae4`) — the "Print / Save as PDF" button now calls `window.__printReport`, which pre-sizes every Plotly chart to explicit A4 dimensions (580 px wide, 300/360 px tall) before invoking `window.print()`. A new `@page { size: A4; margin: 12mm }` rule and an expanded `@media print` block fix the `.doc` overflow (which caused Safari to render the whole print job blank after the first page), cap chart widths to the A4 content column to prevent truncation, and reflow the monthly-returns heatmap table so all 12 month columns and the Year total fit without clipping. `sizeForScreen` restores responsive chart sizing after the dialog closes; `beforeprint`/`afterprint` handlers cover the same sequence for a direct Cmd/Ctrl+P.
- **DB URL normalised to psycopg v3 dialect** (`postgresql+psycopg://`) in
  `backend/database/connection.py`; `DATABASE_URL` is accepted in either dialect and
  normalised at engine-creation time (`e1dd918`).
- **`run.py` launcher hardened** — port-conflict pre-checks with kill hints
  (`check_ports_free`), unbuffered backend output, increased health-wait timeout, TTY
  detection to skip the Gemini-key prompt in non-interactive contexts (CI), smarter
  env parsing (strips surrounding quotes and inline comments), and interactive y/N
  prompts (`ed31a92`, `b8c9332`, `533dedb`, merged as PR \#16).
- **Railway Claude plugin** enabled in `.claude/settings.json` (`b1a9b07`).
- **MetricsPanel promoted to shared component** (`6056272`) — `AIAnalystModal` no
  longer maintains a private `MetricsGrid`; it renders the shared `MetricsPanel` as a
  top-strip inside the modal, with a new `tourHook` prop to suppress the onboarding
  anchor in modal context. Canonical 5×2 metric set updated with signed/unsigned
  percent formatting.
- **Results prefetch** (`45dddf4`) — `NewBacktest` now fetches the completed run
  detail immediately after submission and passes it via React Router state, so
  `RunResults` renders without a second network round-trip.
- **Gemini default model updated from `gemini-2.5-flash-lite` to `gemini-3.5-flash`**
  (`ad77f90`) — reflected in `.env.example`, `backend/config.py`, and
  `backend/llm/gemini_provider.py`.
- **Backtest runs scoped to anonymous `client_id`** (`1acc780`) — `BacktestRun`
  gains a nullable, indexed `client_id` column; `POST /backtests` reads `X-Client-Id`
  from the request header and persists it; `GET /backtests` returns only the caller's
  runs (empty list when the header is absent; legacy `NULL` rows are never surfaced).
- **`ReportActionMenu` and `AIAnalystModal`** updated for the new Chromium PDF path
  (`b7996f6`) — the download menu now surfaces both the offline HTML export and the
  server-side true-PDF render as distinct actions.

### Fixed

- **Dockerfile base image pinned to `python:3.11-slim-bookworm`** (`b6718ce`) —
  the floating `python:3.11-slim` tag now resolves to Debian trixie (13), where
  Playwright 1.49's `playwright install --with-deps chromium` fails on renamed
  font packages (`ttf-unifont`, `ttf-ubuntu-font-family`). Pinned to bookworm
  (Debian 12) to restore the Railway backend build. A `# Don't un-pin` comment
  was added to the `Dockerfile` to make the intent explicit.

### CI

- **Nightly documentation-refresh workflow** (`nightly-docs.yml`) — Claude Code runs
  headless at 02:00 UTC each night, reads the last 24 h of commits, and opens a pull
  request with any stale doc updates. Auth via `CLAUDE_CODE_OAUTH_TOKEN` (PR \#9,
  `612e39e`, `4dfc948`). `id-token: write` permission added after initial OIDC failure
  (PR \#10, `58a4811`).
- **GitHub Actions bumped to Node 24 majors** (PR \#12, `01d9c30`) —
  `actions/checkout`, `actions/setup-python`, and `actions/setup-node` updated to v6
  across all four workflows, ahead of GitHub's 2026-06-02 Node 20 deprecation.
  Permissions comment in `nightly-docs.yml` clarified to explain why
  `id-token: write` is required regardless of the model-auth method.
- **Nightly-docs `--max-turns` raised from 30 to 60**; prompt reorganised to put the
  two mandatory updates first and add turn-budget guidance (`5dbfc10`).

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
- `2026-04-29 ecdf3bb` Initial project scaffold for QuantEdge (Luca Di Pietro). Backend skeleton, project layout, baseline `requirements.txt`.

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

### Week of 2026-05-28 — *Launcher hardening + Docker production setup*

- `2026-05-28 5dbfc10` Nightly docs: increase max turns and clarify prompt (Luca Di Pietro).
- `2026-05-28 ed31a92` Refine launcher env parsing, deps, and ports — port-conflict checks with kill hints, TTY detection, interactive key prompts, unbuffered backend output (Filippo Selmi).
- `2026-05-28 b8c9332` Skip Gemini API prompt in non-tty & refine logic (Filippo Selmi).
- `2026-05-28 533dedb` Reformat run.py and tidy .env.example (Filippo Selmi; merged via PR \#16).
- `2026-05-28 b1a9b07` Enable Railway plugin in Claude settings (Luca Di Pietro).
- `2026-05-28 e1dd918` Normalize DB URL and add frontend Dockerfile — `frontend/Dockerfile.prod`, psycopg v3 support, Railway-compatible backend CMD (Filippo Selmi).

### Week of 2026-05-29 — *Frontend polish + backtest isolation*

- `2026-05-29 b81c8cd` Add `offsetLeft` prop to `MarketLoadingScreen` (Baumender11).
- `2026-05-29 f0b28c1` Add loading screen and backtest-status polling to `RunResults` (Baumender11).
- `2026-05-29 b3acd7d` Add `OnboardingTour` and replay footer link (Luca Di Pietro).
- `2026-05-29 aed9915` Adjust AI analyst modal layout and stat width (Luca Di Pietro).
- `2026-05-29 a7ffe1c` Add `PipelineLoadingScreen` and replace per-page loaders (Baumender11; merged via PR \#18).
- `2026-05-29 45dddf4` Prefetch results and pass via router state (Baumender11).
- `2026-05-29 13c93fc` Add Playwright snapshots and tour assets (Baumender11).
- `2026-05-29 38816c3` Add IBM Plex font bundle and `exportReportHtml` utility (Luca Di Pietro; merged via PR \#19).
- `2026-05-29 ad77f90` Update Gemini model to `gemini-3.5-flash` (Filippo Selmi).
- `2026-05-29 6056272` Replace AI metrics grid with shared `MetricsPanel` (Baumender11).
- `2026-05-29 fd57ede` Add HTML report download to AI Analyst modal (Luca Di Pietro).
- `2026-05-29 1acc780` Scope backtests by anonymous `client_id` — `BacktestRun.client_id` column, `X-Client-Id` header dependency, `frontend/src/api/clientId.ts` UUID utility (Filippo Selmi).
- `2026-05-29 38a3505` chore(docs): nightly auto-refresh 2026-05-29 (automated — Claude Code; merged via PR \#17).

### Week of 2026-06-01 — *True PDF export, Dockerfile fix, mobile-responsive UI*

- `2026-06-01 020fcdc` Remove stale `tour-step2-strategies.png` asset (Luca Di Pietro).
- `2026-06-01 b7996f6` Add PDF export via headless Chromium — `POST /backtests/{run_id}/report.pdf`, `backend/analytics/report_pdf_render.py`, `PdfSectionsDialog` component, Playwright in `requirements.txt` and `Dockerfile` (Luca Di Pietro; merged as PR \#21).
- `2026-06-01 b6718ce` Fix backend build: pin Dockerfile base image to `python:3.11-slim-bookworm` — Playwright 1.49's `--with-deps chromium` fails on Debian trixie's renamed font packages; bookworm restores the Railway build (Filippo Selmi).
- `2026-06-01 b9414a7` Add responsive mobile nav and UI improvements — `MobileNav` drawer + top bar, `SideNav` standalone component, `ScrollHint` wrapper; mobile-friendly charts, `MetricsPanel`, `TradeList`, and modals; `viewport-fit=cover` meta (Luca Di Pietro).
- `2026-06-02 57b0e6c` chore(docs): nightly auto-refresh 2026-06-02 (automated — Claude Code; merged via PR \#23). Updated `docs/user-guide.md` navigation step to mention mobile drawer; added CHANGELOG and diary entries for `b6718ce` and `b9414a7`.
- `2026-06-03 1ebcae4` Add print sizing and __printReport (Filippo Selmi). Print-specific CSS (`@page A4`, overflow fix for Safari, chart/heatmap constraints) and `window.__printReport` runtime that pre-sizes Plotly figures to A4 dimensions before calling `window.print()`; `sizeForScreen` restores responsive sizing afterwards.
- `2026-06-04 650bcbc` chore(docs): nightly auto-refresh 2026-06-04 (automated — Claude Code; merged via PR \#25). Recorded `1ebcae4` (print-path hardening) in `CHANGELOG.md` and `docs/academic/02_project_diary.tex`.
- `2026-06-05 855c0a6` added github nickname — added `[SAGaldini]` GitHub handle for Stefano Angelo Galdini in `docs/academic/main.tex` author list; defined missing `\keystroke` macro in preamble (Stefano Angelo Galdini; merged via PR \#26).
- `2026-06-05 1de8ab2` chore(docs): nightly auto-refresh 2026-06-05 (automated — Claude Code; merged via PR \#27). Recorded `855c0a6` (GitHub nickname and `\keystroke` macro fix) in `CHANGELOG.md` and `docs/academic/02_project_diary.tex`.
- `2026-06-06 57c8425` chore(docs): nightly auto-refresh 2026-06-06 (automated — Claude Code; merged via PR \#28). Only doc-only commits in the 24-hour window; recorded the nightly commit (`1de8ab2`, PR \#27) in the pre-release timeline and project diary. No code was modified.
- `2026-06-07 7ca67e8` Add mobile banner and disable tour on mobile — `MobileDesktopBanner` component shown only on viewports below `lg` (1024 px), `useIsMobile` hook (mirrors `MobileNav` breakpoint), onboarding tour and SideNav replay button suppressed on mobile (Luca Di Pietro).
- `2026-06-07 da11eaf` Rebrand QuantBacktest to QuantEdge — project-wide name change across all documentation, configuration, frontend, and backend files (Luca Di Pietro).
- `2026-06-07 a0b8ac2` Check ports early to fail fast — port availability check for `:8000`/`:5173` moved to the top of `main()`, before venv/dep setup and interactive prompts; duplicate later check removed; execution-order comment added (Luca Di Pietro).
- `2026-06-07 38d0b3a` Merge pull request \#30 from L-Di-Pietro/Little-Final-Fixes (Luca Di Pietro).

### Week of 2026-05-25 — *Documentation pass*

- `2026-05-24 399f763` Update `.gitignore` (Stefano Angelo Galdini).
- `2026-05-24 79e200a` Updated all the current documentation files (Stefano Angelo Galdini). Existing docs (`README`, `ARCHITECTURE`, `CLAUDE`, `ONBOARDING`, `docs/{agents,calendars,data-sources,strategies}.md`) brought in line with the current code.
- `2026-05-24` — new documentation artefacts created for the iCorsi submission (this commit batch): `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CITATIONS.md`, `AI_USAGE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `docs/user-guide.md`, `docs/api.md`, `docs/architecture-diagrams/`, `docs/academic/*` (LaTeX bundle).
- `2026-05-24 612e39e` Nightly headless docs-refresh workflow (`nightly-docs.yml`) added; merged as PR \#9 (Luca Di Pietro).
- `2026-05-24 4dfc948` CI: authenticate nightly docs via `CLAUDE_CODE_OAUTH_TOKEN` (Luca Di Pietro).
- `2026-05-24 58a4811` CI: grant `id-token: write` so `claude-code-action` can run; merged as PR \#10 (Luca Di Pietro).
- `2026-05-24 a5d2bba` chore(docs): nightly auto-refresh 2026-05-24 (automated — Claude Code; merged as PR \#11). First nightly pass; extended `CHANGELOG.md` and `docs/academic/02_project_diary.tex` with post-submission CI entries.
- `2026-05-24 01d9c30` chore(ci): bump GitHub Actions to Node 24 majors (Luca Di Pietro; merged as PR \#12). `actions/checkout@v6`, `actions/setup-python@v6`, and `actions/setup-node@v6` across all four workflows; `nightly-docs.yml` permissions comment updated.
- `2026-05-25 6f940ac` chore(docs): nightly auto-refresh 2026-05-25 (automated — Claude Code; merged as PR \#13). Second nightly pass; recorded the Node 24 Actions upgrade in `CHANGELOG.md` (pre-release timeline + \[Unreleased\] CI section) and added a corresponding subsection to `docs/academic/02_project_diary.tex`.

---

## Contributors (this release)

| Contributor | Real name | GitHub handle | Commits (non-merge) |
|---|---|---|---|
| Aaron Arauz | Aaron Arauz | `Baumender11` | 7 |
| Luca Di Pietro | Luca Di Pietro | `L-Di-Pietro` | 15 |
| Stefano Angelo Galdini | Stefano Angelo Galdini | `SAGaldini` | 7 |
| Filippo Selmi | Filippo Selmi | `FilippoSelmi` (also seen as `selmif`) | 4 |

GitHub Copilot's bot account (`copilot-swe-agent[bot]`) appears in a single merge-resolution commit and is **not** a project contributor; see [`AI_USAGE.md`](AI_USAGE.md).

---

_Last verified against code: 2026-06-08._
