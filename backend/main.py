"""FastAPI application factory.

Run locally with::

    uvicorn backend.main:app --reload

The app is intentionally thin — it just registers routers, configures CORS,
sets up logging, and (optionally) starts the nightly data-refresh scheduler.
All business logic lives in the agents.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import backtest as backtest_routes
from backend.api.routes import data as data_routes
from backend.api.routes import explain as explain_routes
from backend.api.routes import strategies as strategies_routes
from backend.api.schemas import HealthResponse
from backend.config import configure_logging, settings
from backend.database import get_session, init_db

log = structlog.get_logger(__name__)

# Module-level scheduler so the lifespan hook can stop it cleanly.
_scheduler: BackgroundScheduler | None = None


# -----------------------------------------------------------------------------
# Lifespan — DB init, scheduler start, shutdown
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    log.info("api.startup", database=settings.database_url, llm_enabled=settings.llm_enabled)
    init_db()
    _start_scheduler()
    try:
        yield
    finally:
        _stop_scheduler()
        log.info("api.shutdown")


def _start_scheduler() -> None:
    """Schedule a daily data refresh at the configured UTC hour."""
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _nightly_refresh,
        trigger=CronTrigger(hour=settings.nightly_refresh_hour_utc, minute=0),
        id="nightly_refresh",
        replace_existing=True,
    )
    _scheduler.start()


def _stop_scheduler() -> None:
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)


def _nightly_refresh() -> None:
    """Run a freshness sweep across all active assets.

    Imported lazily so APScheduler doesn't trip the SQLAlchemy session-scope
    rules at module load time.
    """
    from backend.agents.data_agent import DataAgent, DataAgentInput
    from backend.database.models import Asset
    from sqlalchemy import select

    log.info("scheduler.nightly_refresh.start")
    session_gen = get_session()
    db = next(session_gen)
    try:
        agent = DataAgent(db)
        assets = db.execute(select(Asset).where(Asset.is_active.is_(True))).scalars().all()
        for asset in assets:
            try:
                agent.run(DataAgentInput(op="refresh", symbol=asset.symbol))
            except Exception:  # one bad ticker shouldn't kill the sweep
                log.exception("scheduler.refresh_failed", symbol=asset.symbol)
    finally:
        try:
            next(session_gen)  # close the generator (runs the finally in get_session)
        except StopIteration:
            pass
    log.info("scheduler.nightly_refresh.done")


# -----------------------------------------------------------------------------
# App factory
# -----------------------------------------------------------------------------
def create_app() -> FastAPI:
    app = FastAPI(
        title="QuantBacktest API",
        version="0.1.0",
        description=(
            "Backtesting framework for retail quantitative traders. "
            "USI Programming II — Project 2.8."
        ),
        lifespan=lifespan,
    )

    # Permissive CORS for local dev; tighten for production.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", response_model=HealthResponse, tags=["meta"])
    def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            llm_enabled=settings.llm_enabled,
            llm_provider=settings.llm_provider,
        )

    app.include_router(data_routes.router)
    app.include_router(strategies_routes.router)
    app.include_router(backtest_routes.router)
    app.include_router(explain_routes.router)

    return app


app = create_app()
