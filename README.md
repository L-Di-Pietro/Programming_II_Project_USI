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
- **Four built-in strategies**: SMA Crossover, RSI Mean Reversion, Bollinger Bands, Donchian Breakout
- **Event-driven backtest engine** with strict bar-`t` → bar-`t+1` fill semantics (no look-ahead)
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
| Data sources | yfinance, CoinGecko, ccxt/Binance, Stooq |
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · Plotly.js |
| Scheduler | APScheduler (nightly data refresh) |
| Tests | pytest · pytest-asyncio · Vitest |
| LLM (deferred) | Provider-agnostic; Gemini adapter scaffolded |

---

## Quick start

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- (Optional) Docker, if you want to test against Postgres

### 1. Clone & install backend

```bash
git clone <this repo>
cd Programming_II_Project_USI

python3 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                   # then edit values if you wish
python scripts/init_db.py              # creates SQLite DB & seeds asset list
python scripts/load_initial_data.py    # bulk-fetches ~10y of historical data
```

### 2. Run the backend

```bash
uvicorn backend.main:app --reload
# Server is now running at http://127.0.0.1:8000
# OpenAPI docs are at http://127.0.0.1:8000/docs
```

### 3. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
# UI is now running at http://127.0.0.1:5173
```

Open the UI in a browser and run your first backtest.

### Run the tests

```bash
pytest                                  # backend tests
cd frontend && npm test                 # frontend tests
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
│   ├── data/                          ← fetchers (yfinance, CoinGecko, Stooq) + cleaner
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
- **Calendar simplification**: BTC trades 24/7, equities don't, FX has a quirky weekend window. We standardize everything to the NYSE business-day calendar. This is fine for daily-bar backtests; revisit for intraday.
- **Single-asset strategies**: each backtest run targets exactly one asset. Portfolio-level (multi-asset) strategies are out of scope for v1.
- **No live trading / paper trading**: this tool is for research, not execution.
- **LLM disabled in v1**: the Explanation Agent ships with a `NullProvider` that returns canned text. Activating Google Gemini is a follow-up task.

---

## Roadmap

| Iteration | Focus |
|---|---|
| **v1** *(this delivery)* | Single-asset backtester, 4 strategies, full UI, deterministic agents |
| v1.1 | Activate Google Gemini for the Explanation Agent |
| v1.2 | Walk-forward / out-of-sample UI, parameter sweeps |
| v2.0 | Multi-asset portfolio strategies, intraday data, paper-trading mode |

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
