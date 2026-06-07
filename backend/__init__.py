"""QuantEdge backend package.

The package is split into vertical slices that mirror the architecture diagram
in ARCHITECTURE.md:

* ``config``    — environment-driven settings (single source of truth)
* ``database``  — SQLAlchemy models, engine, session factory
* ``llm``       — LLM provider abstraction (Null + Gemini stubs)
* ``data``      — data fetchers + cleaner
* ``strategies``— trading strategies + ``BaseStrategy`` ABC + registry
* ``backtest``  — event-driven engine, portfolio, execution, risk
* ``analytics`` — KPIs + chart payloads
* ``agents``    — six specialized agents that wire the above together
* ``api``       — FastAPI routes + Pydantic schemas
"""

__version__ = "0.1.0"
