# Citations

QuantEdge is a *USI Programming in Finance II — Project 2.8* submission and follows the course's policy on foreign-code attribution: every third-party library bundled into the project, and every algorithm or formula whose mathematical form we did not derive ourselves, is cited here in a single table. Sources cited inline elsewhere in the repository (e.g. one-line citations in [`docs/strategies.md`](docs/strategies.md)) are re-listed here in author-year form for easy lookup.

The list is organised into four sections:

- [Section A — Python libraries](#section-a--python-libraries-backend) (backend `requirements.txt`).
- [Section B — Frontend libraries](#section-b--frontend-libraries-node--npm) (`frontend/package.json`).
- [Section C — Algorithms & formulas](#section-c--algorithms--formulas) (every KPI and strategy).
- [Section D — Trading-calendar data sources](#section-d--trading-calendar-data-sources--benchmark-ticker).

A **license audit** at the bottom confirms that every bundled library is permissively licensed (MIT / BSD / Apache-2.0). No GPL-incompatible code is shipped.

---

## Section A — Python libraries (backend)

Source of truth: [`requirements.txt`](requirements.txt). Versions are pinned exactly.

| Library | Pinned version | License (SPDX) | Project URL |
|---|---|---|---|
| `fastapi` | 0.115.4 | MIT | <https://fastapi.tiangolo.com/> |
| `uvicorn[standard]` | 0.32.0 | BSD-3-Clause | <https://www.uvicorn.org/> |
| `pydantic` | 2.9.2 | MIT | <https://docs.pydantic.dev/> |
| `pydantic-settings` | 2.6.1 | MIT | <https://docs.pydantic.dev/latest/concepts/pydantic_settings/> |
| `python-multipart` | 0.0.17 | Apache-2.0 | <https://github.com/Kludex/python-multipart> |
| `websockets` | 13.1 | BSD-3-Clause | <https://websockets.readthedocs.io/> |
| `SQLAlchemy` | 2.0.36 | MIT | <https://www.sqlalchemy.org/> |
| `alembic` | 1.13.3 | MIT | <https://alembic.sqlalchemy.org/> |
| `pandas` | 2.2.3 | BSD-3-Clause | <https://pandas.pydata.org/> |
| `numpy` | 2.1.2 | BSD-3-Clause | <https://numpy.org/> |
| `scipy` | 1.14.1 | BSD-3-Clause | <https://scipy.org/> |
| `yfinance` | 1.3.0 | Apache-2.0 | <https://github.com/ranaroussi/yfinance> |
| `curl_cffi` | 0.15.0 | MIT | <https://github.com/yifeikong/curl_cffi> |
| `pandas-datareader` | 0.10.0 | BSD-3-Clause | <https://pydata.github.io/pandas-datareader/> |
| `ccxt` | 4.4.20 | MIT | <https://github.com/ccxt/ccxt> |
| `requests` | 2.32.3 | Apache-2.0 | <https://requests.readthedocs.io/> |
| `plotly` | 5.24.1 | MIT | <https://plotly.com/python/> |
| `APScheduler` | 3.10.4 | MIT | <https://apscheduler.readthedocs.io/> |
| `google-genai` | ≥2.3.0 | Apache-2.0 | <https://github.com/googleapis/python-genai> |
| `structlog` | 24.4.0 | Apache-2.0 OR MIT (dual) | <https://www.structlog.org/> |
| `python-dateutil` | 2.9.0 | Apache-2.0 OR BSD-3-Clause (dual) | <https://github.com/dateutil/dateutil> |
| `tenacity` | 9.0.0 | Apache-2.0 | <https://github.com/jd/tenacity> |
| `exchange-calendars` | 4.5.5 | Apache-2.0 | <https://github.com/gerrymanoim/exchange_calendars> |
| `pytest` | 8.3.3 | MIT | <https://docs.pytest.org/> |
| `pytest-asyncio` | 0.24.0 | Apache-2.0 | <https://pytest-asyncio.readthedocs.io/> |
| `pytest-cov` | 5.0.0 | MIT | <https://pytest-cov.readthedocs.io/> |
| `httpx` | 0.28.1 | BSD-3-Clause | <https://www.python-httpx.org/> |
| `ruff` | 0.7.2 | MIT | <https://docs.astral.sh/ruff/> |
| `mypy` | 1.13.0 | MIT | <https://mypy.readthedocs.io/> |

**Commented out in `requirements.txt`** (available as opt-in alternatives, not bundled):

- `psycopg[binary]` 3.2.3 — LGPL-3.0-only (PostgreSQL driver, kept off the default install path so the default install stays MIT/BSD/Apache only).
- `anthropic` 0.39.0 — MIT (alternative `LLMProvider`).
- `openai` 1.55.0 — Apache-2.0 (alternative `LLMProvider`).

---

## Section B — Frontend libraries (Node / npm)

Source of truth: [`frontend/package.json`](frontend/package.json). Version specifiers use the semver caret (`^`).

### Runtime dependencies

| Library | Spec | License (SPDX) | Project URL |
|---|---|---|---|
| `react` | ^18.3.1 | MIT | <https://react.dev/> |
| `react-dom` | ^18.3.1 | MIT | <https://react.dev/> |
| `react-router-dom` | ^6.27.0 | MIT | <https://reactrouter.com/> |
| `axios` | ^1.7.7 | MIT | <https://axios-http.com/> |
| `plotly.js-dist-min` | ^2.35.2 | MIT | <https://plotly.com/javascript/> |
| `react-plotly.js` | ^2.6.0 | MIT | <https://github.com/plotly/react-plotly.js> |
| `react-markdown` | ^9.0.1 | MIT | <https://github.com/remarkjs/react-markdown> |
| `jspdf` | ^2.5.2 | MIT | <https://github.com/parallax/jsPDF> |

### Build & dev dependencies

| Library | Spec | License (SPDX) | Project URL |
|---|---|---|---|
| `typescript` | ^5.6.3 | Apache-2.0 | <https://www.typescriptlang.org/> |
| `vite` | ^5.4.10 | MIT | <https://vitejs.dev/> |
| `@vitejs/plugin-react` | ^4.3.3 | MIT | <https://github.com/vitejs/vite-plugin-react> |
| `vitest` | ^2.1.4 | MIT | <https://vitest.dev/> |
| `@testing-library/react` | ^16.0.1 | MIT | <https://testing-library.com/react> |
| `jsdom` | ^25.0.1 | MIT | <https://github.com/jsdom/jsdom> |
| `eslint` | ^9.13.0 | MIT | <https://eslint.org/> |
| `tailwindcss` | ^3.4.14 | MIT | <https://tailwindcss.com/> |
| `postcss` | ^8.4.47 | MIT | <https://postcss.org/> |
| `autoprefixer` | ^10.4.20 | MIT | <https://github.com/postcss/autoprefixer> |
| `openapi-typescript` | ^7.4.2 | MIT | <https://github.com/openapi-ts/openapi-typescript> |
| `@types/node` | ^25.6.0 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/react` | ^18.3.12 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/react-dom` | ^18.3.1 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `@types/react-plotly.js` | ^2.6.3 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |

---

## Section C — Algorithms & formulas

Every formula coded in `backend/analytics/metrics.py` and every strategy in `backend/strategies/`. KPI formulas are written out in their general form in [`docs/academic/03_methodology.tex`](docs/academic/03_methodology.tex).

### KPIs (`backend/analytics/metrics.py`)

| Metric | Formula (sketch) | Citation |
|---|---|---|
| **Sharpe ratio** | $S = \sqrt{k}\, \bar r / \sigma_r$, where $k$ is periods-per-year for the bar frequency | Sharpe (1966) |
| **Sortino ratio** | Like Sharpe but $\sigma_r$ replaced by the downside semi-deviation | Sortino & Price (1994) |
| **CAGR** | $(V_T / V_0)^{1/y} - 1$ | Bacon (2008), ch. 1 |
| **Annualised return** | Same as CAGR for non-compounded equity; matches Bacon's conventions | Bacon (2008) |
| **Annualised volatility** | $\sqrt{k} \cdot \mathrm{std}(r_t)$ | Bacon (2008) |
| **Maximum drawdown** | $\min_t (V_t - \max_{s \le t} V_s) / \max_{s \le t} V_s$ | Bacon (2008), ch. 4 |
| **Calmar ratio** | $\mathrm{CAGR} / |\mathrm{maxDD}|$ | Young (1991) |
| **Profit factor** | $\sum \mathrm{wins} / \sum |\mathrm{losses}|$ | Pardo (2008) |
| **Win rate** | $\#\mathrm{wins} / \#\mathrm{trades}$ | Pardo (2008) |
| **Expectancy** | $\mathrm{winrate} \cdot \overline{\mathrm{win}} - (1 - \mathrm{winrate}) \cdot \overline{\mathrm{loss}}$ | Tharp (1998) |
| **Average win / average loss** | Per-leg mean of positive / negative trade P&L | Pardo (2008) |

The annualisation factor $k$ is asset-class- and timeframe-aware; the lookup table lives in `backend/analytics/periods.py` and is documented in [`docs/calendars.md`](docs/calendars.md). The rationale (a Sharpe ratio computed against the wrong $k$ misstates the annualised number by tens of percent) follows Bacon's treatment.

### Strategies (`backend/strategies/`)

| Strategy slug | Citation |
|---|---|
| `sma-crossover` | Pardo (2008), §4.2 "The Moving Average Crossover" |
| `macd-crossover` | Appel (2005) |
| `ichimoku-cloud` | Hosoda (1969) |
| `time-series-momentum` | Moskowitz, Ooi & Pedersen (2012) |
| `donchian-breakout` | Faith (2007); the "Turtle" channel system |
| `keltner-channels` | Keltner (1960); ATR-scaled variant popularised by Raschke in the 1990s |
| `rsi-mean-reversion` | Wilder (1978) |
| `bollinger-bands` | Bollinger (2001) |
| `cci` | Lambert (1980) |
| `stochastic-oscillator` | Lane (1984) |
| `buy-and-hold` | Definitional baseline; no academic citation |

### Foundational methodology

| Concept | Why it matters here | Citation |
|---|---|---|
| **Look-ahead bias as the canonical backtest pitfall** | Enforced architecturally in `backend/backtest/engine.py` via bar-`t` → bar-`t+1` fills; asserted by an oracle strategy in `tests/test_engine_no_lookahead.py` | López de Prado (2018), ch. 7 |
| **Probability of backtest overfitting** | Framing for why we discourage tuning parameters by repeatedly running the full backtest; motivates the walk-forward split exposed by the Strategy Agent | Bailey & López de Prado (2014) |
| **Practical portfolio-performance measurement** | The conventions underpinning the KPI definitions above | Bacon (2008) |
| **Trading-strategy evaluation framework** | The "no strategy works in every regime" framing in [`docs/strategies.md`](docs/strategies.md); the recommended frictions (commission, slippage) are first-class parameters | Pardo (2008) |
| **Algorithmic-trading practitioner perspective** | Realism about retail backtesting (e.g. survivorship bias, the gap between paper P&L and live P&L) | Chan (2008) |

### Full author-year references

Each entry below appears in the LaTeX bibliography as well; see [`docs/academic/references.bib`](docs/academic/references.bib).

- **Appel, G.** (2005). *Technical Analysis: Power Tools for Active Investors*. FT Press.
- **Bacon, C.** (2008). *Practical Portfolio Performance Measurement and Attribution*, 2nd ed. Wiley.
- **Bailey, D. H. & López de Prado, M.** (2014). "The Probability of Backtest Overfitting." *Journal of Computational Finance*, 20(4), 39–69. doi:10.21314/JCF.2016.322.
- **Bollinger, J.** (2001). *Bollinger on Bollinger Bands*. McGraw-Hill.
- **Chan, E.** (2008). *Quantitative Trading: How to Build Your Own Algorithmic Trading Business*. Wiley.
- **Faith, C.** (2007). *The Way of the Turtle: The Secret Methods that Turned Ordinary People into Legendary Traders*. McGraw-Hill.
- **Hosoda, G.** (1969). *Ichimoku Kinkō Hyō*. Tokyo.
- **Keltner, C. W.** (1960). *How to Make Money in Commodities*. Keltner Statistical Service.
- **Lambert, D. R.** (1980). "Commodity Channel Index: Tool for Trading Cyclic Trends." *Commodities Magazine*, October 1980.
- **Lane, G. C.** (1984). "Lane's Stochastics." *Technical Analysis of Stocks & Commodities*, 2(3).
- **López de Prado, M.** (2018). *Advances in Financial Machine Learning*. Wiley.
- **Moskowitz, T., Ooi, Y. H. & Pedersen, L. H.** (2012). "Time Series Momentum." *Journal of Financial Economics*, 104(2), 228–250. doi:10.1016/j.jfineco.2011.11.003.
- **Pardo, R.** (2008). *The Evaluation and Optimization of Trading Strategies*, 2nd ed. Wiley.
- **Sharpe, W. F.** (1966). "Mutual Fund Performance." *Journal of Business*, 39(1), 119–138.
- **Sortino, F. A. & Price, L. N.** (1994). "Performance Measurement in a Downside Risk Framework." *Journal of Investing*, 3(3), 59–64.
- **Tharp, V. K.** (1998). *Trade Your Way to Financial Freedom*. McGraw-Hill.
- **Wilder, J. W.** (1978). *New Concepts in Technical Trading Systems*. Trend Research.
- **Young, T. W.** (1991). "Calmar Ratio: A Smoother Tool." *Futures*, 20(1).

---

## Section D — Trading-calendar data sources & benchmark ticker

| Item | What we use it for | License / terms | Citation |
|---|---|---|---|
| **`exchange_calendars`** (XNYS calendar) | Authoritative NYSE business-day index for equities and ETFs; drives both the daily-bar reindex and the hourly-bar grid (half-past UTC hours, with early-close handling) | Apache-2.0 | Manoim, G. et al. (open-source project at <https://github.com/gerrymanoim/exchange_calendars>) |
| **24×5 FX calendar** | Bespoke window `Sunday 22:00 UTC → Friday 22:00 UTC` for FX bars; no banking-holiday subtraction because FX trades through US/UK holidays | Implemented in-repo (`backend/data/cleaner.py`) | — |
| **24×7 crypto calendar** | Full hourly grid `pd.date_range(start, end, freq="h")`; no closures | Implemented in-repo | — |
| **Yahoo Finance (via `yfinance`)** | Primary OHLCV source for equities, ETFs, FX, and crypto | Apache-2.0 client; Yahoo terms of service apply to the data itself | <https://finance.yahoo.com> |
| **Binance (via `ccxt`)** | Crypto OHLCV fallback when yfinance fails or when the user requests bars older than the 730-day yfinance hourly horizon | MIT client; Binance terms of service apply | <https://www.binance.com> |
| **Stooq (via `pandas-datareader`)** | FX EOD fallback when yfinance fails | BSD-3-Clause client; Stooq terms of service apply | <https://stooq.com> |
| **SPY (S&P 500 ETF)** ticker | Cross-asset benchmark overlay (alongside same-asset buy-and-hold) on every backtest | Trading symbol, no license; data fetched via the chain above | State Street Global Advisors SPDR® S&P 500 ETF Trust |

Per the project's [data sources](docs/data-sources.md) doc, data fetched from any of these sources is for **research only**. We do not redistribute the underlying market data.

---

## License audit

Every library shipped in the default install path of QuantEdge is licensed under one of: **MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0**, or a dual-license that includes one of these (e.g. `python-dateutil` is dual-licensed Apache-2.0 / BSD-3-Clause; `structlog` is dual-licensed Apache-2.0 / MIT). No GPL or AGPL code is bundled. The optional `psycopg[binary]` Postgres driver is LGPL-3.0-only and is left commented out in `requirements.txt` precisely so the default install path stays unambiguously permissive; teams that opt into Postgres in production accept the LGPL terms by uncommenting the line.

QuantEdge itself is released under the MIT License — see [`LICENSE`](LICENSE).

---

_Last verified against code: 2026-05-24._
