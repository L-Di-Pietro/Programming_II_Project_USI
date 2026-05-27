# QuantBacktest — A Backtesting Framework for Retail Quantitative Traders

> **USI Programming II — Project 2.8**
> A web-based backtesting platform that helps retail traders test trading strategies across **equities**, **FX**, and **crypto** before risking real capital.

---

## Why does this exist?

Retail quantitative traders lose money for two related reasons:

1. They deploy strategies that have never been rigorously tested on historical data.
2. When they *do* test, they cut corners — using future information by accident, ignoring slippage and commissions, running too few trades to reach statistical significance.

**QuantBacktest** is built to make rigorous backtesting accessible. It enforces look-ahead-bias prevention by construction, exposes commissions and slippage as first-class user parameters so strategies can be stress-tested, and presents results through the same charts and KPIs used by professional quants (equity curve, drawdown, monthly heatmap, Sharpe / Sortino / Calmar, win rate, profit factor, etc.).

> Retail tip baked into the product: *if your backtested Max Drawdown is 20%, prepare yourself for a 30% drawdown in live trading.*

---

## Features (v1)

- **Multi–asset-class** backtesting: equities (AAPL, NVDA, MSFT, SPY), crypto (BTC), FX (EUR/USD)
- **Daily and hourly bar resolution** with per-asset-class trading calendars (NYSE for equities/ETF, 24/5 for FX, 24/7 for crypto)
- **Four built-in strategies**: SMA Crossover, RSI Mean Reversion, Bollinger Bands, Donchian Breakout
- **Event-driven backtest engine** with strict bar-`t` → bar-`t+1` fill semantics (no look-ahead) at any timeframe
- **Configurable execution model**: commission (bps), slippage (bps or ATR-scaled), variable position sizing
- **Standard performance dashboard**: Equity curve, Underwater (drawdown) curve, Monthly returns heatmap, full KPI grid
- **Six-agent architecture** (4 deterministic, 2 LLM-backed and disabled in v1)
- **SQL persistence** — every run is reproducible, every trade is logged
- **React + TypeScript web frontend** with interactive Plotly charts
- **LLM-ready** — Explanation Agent is fully scaffolded behind an `LLMProvider` abstraction; flip a flag to enable Google Gemini in a future iteration

---

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11+ · FastAPI · SQLAlchemy 2.x · Pydantic v2 |
| Database (dev) | SQLite |
| Database (prod-ready) | PostgreSQL 15+ (drop-in replacement via `DATABASE_URL`) |
| Data sources | yfinance (equity/ETF/FX/crypto), ccxt/Binance (crypto fallback), Stooq (FX fallback) |
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · Plotly.js |
| Scheduler | APScheduler (nightly data refresh) |
| Tests | pytest · pytest-asyncio · Vitest |
| LLM (deferred) | Provider-agnostic; Gemini adapter scaffolded |

---

## Quick start

This is the canonical way to run QuantBacktest locally. It works the same on
**macOS / Linux** and **Windows** — where a command differs, both are shown.
Lines beginning with `#` are notes or optional steps you can skip.

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- (Optional) Docker — only if you want to run against Postgres instead of SQLite

### 1. Get the code & set up the Python environment

```bash
git clone <this repo>
cd Programming_II_Project_USI

# Create a virtual environment...
python3 -m venv .venv            # Windows: py -m venv .venv   (or: python -m venv .venv)

# ...and activate it:
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\Activate.ps1     # Windows (PowerShell)
# .venv\Scripts\activate.bat     # Windows (cmd)

# Anaconda/Miniconda users: the auto-activated (base) env shadows .venv and is
# the #1 cause of "runs on main but 500s on a feature branch". Run
# `conda deactivate` (repeat until the "(base)" prefix is gone) BEFORE the line
# above. Then confirm your tools resolve INTO .venv, not /opt/anaconda3:
which python                     # macOS / Linux → must print  .../.venv/bin/python
# where python                   # Windows       → must print  ...\.venv\Scripts\python.exe

pip install -r requirements.txt
# ^ Re-run this whenever you switch branches: a branch may add a dependency
#   (e.g. reportlab). If the active env is missing one, uvicorn won't start.

# Create your local .env from the template:
cp .env.example .env             # Windows (PowerShell): Copy-Item .env.example .env
                                 # Windows (cmd):        copy .env.example .env
# Defaults work as-is — backtests and charts need no API keys. The optional
# "Explain" (LLM) feature needs a GEMINI_API_KEY in .env; without one it errors
# when used, but everything else works.
```

### 2. Initialize & load the database

```bash
python scripts/init_db.py                               # create tables + seed assets/strategies
# ^ Idempotent. Skip if you already have a populated quantbacktest.db.

python scripts/load_initial_data.py --timeframes 1d 1h  # fetch DAILY + HOURLY history for every asset
# ^ Downloads from the network (a few minutes). Skip if your DB is already loaded.
#   Daily only? Drop the "1h":  python scripts/load_initial_data.py
```

> On Windows, use `python` (or `py`) wherever these commands say `python3`.

### 3. Run the backend (terminal 1)

```bash
# Make sure THIS terminal has .venv active — a fresh terminal may re-activate
# conda's (base). Verify:  which uvicorn  → must print .../.venv/bin/uvicorn
# When in doubt, run it by explicit path:  .venv/bin/uvicorn backend.main:app --reload
uvicorn backend.main:app --reload
# Backend at http://localhost:8000  ·  OpenAPI docs at http://localhost:8000/docs
```

### 4. Run the frontend (terminal 2)

```bash
cd frontend
npm install        # first run only — skip on later starts
npm run dev
# UI at http://localhost:5173
```

### 5. Open the app

Browse to **http://localhost:5173** and run your first backtest.
(Shortcut: `open http://localhost:5173` on macOS, `start http://localhost:5173` on Windows.)

### Troubleshooting

**Every page shows `500` / "Could not reach backend… Is uvicorn running on
:8000?" — and the asset/strategy dropdowns are empty.**
The frontend is up but the backend isn't bound to `:8000`, so Vite's dev proxy
returns 500 for every `/api` call. The usual cause: the backend was started in
the wrong Python environment (often Anaconda's `(base)`, which lacks the project
deps). Fix it in the terminal running the backend:

```bash
which python                        # must point INTO .venv, not /opt/anaconda3
pip install -r requirements.txt     # in the ACTIVE env; re-run after switching branches
curl http://127.0.0.1:8000/healthz  # expect {"status":"ok", ...}
```

If `ps` shows `uvicorn` "running" yet nothing listens on `:8000`, it import-
crashed under `--reload` (the file-watcher parent process stays alive). Read its
terminal for the traceback — a `ModuleNotFoundError` means a missing dependency;
install it in the active env and uvicorn auto-reloads.

### Run the tests

```bash
pytest                                  # backend tests
cd frontend && npm test                 # frontend tests
```

### Re-running from scratch (optional)

Only needed if you ran it before and want a clean slate.

```bash
# 1) Stop the servers — press Ctrl+C in each terminal. If a port is still busy:
lsof -ti:8000 | xargs kill -9        # macOS / Linux (repeat for :5173)
# Windows: netstat -ano | findstr "8000 5173"   then   taskkill /PID <pid> /F

# 2) Wipe the database — ONLY if you want fresh data (then re-run step 2):
rm -f quantbacktest.db*              # macOS / Linux
# Windows (PowerShell): Remove-Item quantbacktest.db* -Force
# Windows (cmd):        del quantbacktest.db*
```

### Alternative: one-command Docker stack (Postgres)

Prefer Docker? `docker-compose.yml` brings up the whole app on Postgres — no
local Python/Node install needed:

```bash
docker compose up --build            # start everything (UI on :5173, API on :8000)
docker compose down -v               # stop and wipe the DB volume
```

---

## Project layout

```
Programming_II_Project_USI/
├── README.md                          ← you are here
├── CLAUDE.md                          ← guide for Claude Code (and humans)
├── ARCHITECTURE.md                    ← detailed architecture & design
├── requirements.txt                   ← Python dependencies
├── pyproject.toml                     ← Python tooling config
├── .env.example                       ← environment variable template
├── docker-compose.yml                 ← optional Postgres + service stack
│
├── backend/                           ← FastAPI backend
│   ├── main.py                        ← app factory, lifespan hooks
│   ├── config.py                      ← Pydantic Settings
│   ├── agents/                        ← 6 specialized agents
│   ├── api/                           ← REST routes & Pydantic schemas
│   ├── analytics/                     ← KPIs & chart payload builders
│   ├── backtest/                      ← event loop, portfolio, execution, risk
│   ├── data/                          ← fetchers (yfinance, ccxt/Binance, Stooq) + cleaner
│   ├── database/                      ← SQLAlchemy models & connection
│   ├── llm/                           ← LLMProvider abstraction (Null + Gemini)
│   └── strategies/                    ← 4 trading strategies + base
│
├── frontend/                          ← React + TS + Vite + Tailwind
│   └── src/
│       ├── components/                ← chart & form components
│       ├── pages/                     ← Dashboard, NewBacktest, RunResults, Strategies
│       └── api/                       ← typed client
│
├── tests/                             ← pytest suite
├── scripts/                           ← init_db.py, load_initial_data.py
└── docs/                              ← deep-dive docs
```

---

## How the system works (high level)

1. **User picks an asset, a strategy, and parameters** in the React UI.
2. **Backtest run is enqueued** as a FastAPI background task; the UI polls (or subscribes) for status.
3. The **Backtest Agent** loads OHLCV bars from the local SQL database — *never* from a live API. This guarantees reproducibility.
4. The engine iterates **bar by bar**: at each bar `t`, the strategy sees only data up to and including `t`, generates a signal, and any resulting order is filled at the **open of bar `t+1`**, with commission and slippage subtracted from the price. This fill rule is enforced in the engine, not delegated to strategies.
5. The **Analytics Agent** computes all KPIs and chart payloads from the trade ledger and equity curve.
6. Results are persisted to SQL and rendered in the UI as Plotly charts and a metrics grid.
7. (Future) The **Explanation Agent** uses a Google Gemini call to translate the metrics into plain language for the user.

For the deep-dive, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Known limitations (v1)

- **Survivorship bias**: yfinance only carries *currently-listed* tickers. Backtests on a fixed equity universe therefore over-state historical returns. We document this rather than hide it; serious users would need a paid delisted-aware data source.
- **Hourly history horizon**: all hourly data is limited to ~730 days back by yfinance (now the primary source across every asset class) — the frontend caps the date picker accordingly. The Binance fallback inside `CryptoFetcher` can still serve older crypto hourly bars for ad-hoc requests.
- **Single-asset strategies**: each backtest run targets exactly one asset. Portfolio-level (multi-asset) strategies are out of scope for v1.
- **No live trading / paper trading**: this tool is for research, not execution.
- **LLM disabled in v1**: the Explanation Agent ships with a `NullProvider` that returns canned text. Activating Google Gemini is a follow-up task.

---

## Roadmap

| Iteration | Focus |
|---|---|
| **v1** *(this delivery)* | Single-asset backtester, 4 strategies, full UI, daily + hourly bars, deterministic agents |
| v1.1 | Activate Google Gemini for the Explanation Agent |
| v1.2 | Walk-forward / out-of-sample UI, parameter sweeps |
| v2.0 | Multi-asset portfolio strategies, minute-level data, paper-trading mode |

---

## Team

USI Lugano — Programming II (Spring 2026).

## License

MIT — see [`LICENSE`](./LICENSE).

## Citing standard formulas

The KPI formulas implemented in `backend/analytics/metrics.py` follow the conventions of:

- Bacon, C. (2008). *Practical Portfolio Performance Measurement and Attribution*. Wiley.
- Pardo, R. (2008). *The Evaluation and Optimization of Trading Strategies*. Wiley.
- Chan, E. (2008). *Quantitative Trading: How to Build Your Own Algorithmic Trading Business*. Wiley.

Each metric's docstring cites its formula source.
