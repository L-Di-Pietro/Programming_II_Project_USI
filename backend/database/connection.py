"""SQLAlchemy engine + session factory.

The same code targets SQLite (dev) and Postgres (prod) — the only difference
is ``DATABASE_URL``. We therefore stick to SQLAlchemy generic types and avoid
backend-specific features in models.
"""

from __future__ import annotations

from collections.abc import Generator

import structlog
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings

log = structlog.get_logger(__name__)


class Base(DeclarativeBase):
    """SQLAlchemy 2.x declarative base. All models inherit from this."""


def _build_engine(url: str) -> Engine:
    """Construct the SQLAlchemy engine.

    Notes
    -----
    * For SQLite we set ``check_same_thread=False`` so the engine can be used
      from FastAPI's threadpool. SQLite locking semantics are still correct
      because we always go through a Session.
    * ``future=True`` is the SQLAlchemy 2.0 default; explicit here as a
      reminder that we use the new-style API exclusively.
    """
    connect_args: dict[str, object] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    return create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,  # silently reconnect dropped DB connections
        future=True,
    )


def _normalize_db_url(url: str) -> str:
    """Force Postgres URLs to the psycopg v3 dialect (postgresql+psycopg://); SQLite passes through."""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


# Module-level engine — instantiated once per process.
engine: Engine = _build_engine(_normalize_db_url(settings.database_url))

# Session factory. Use ``get_session`` as a FastAPI dependency rather than
# instantiating directly.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session.

    Example
    -------
    >>> @router.get("/things")
    ... def list_things(db: Session = Depends(get_session)) -> list[Thing]:
    ...     return db.query(Thing).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Idempotent — safe to call repeatedly.

    For schema migrations beyond v1, use Alembic. ``init_db`` is enough for
    bootstrapping a fresh DB; never run it against production data.
    """
    # Ensure model classes are imported so SQLAlchemy registers them on Base.metadata.
    # Local import avoids a circular dependency at module load time.
    from backend.database import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_client_id_column()


def _ensure_client_id_column() -> None:
    """Add ``backtest_runs.client_id`` on pre-existing DBs (no Alembic). Idempotent."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "backtest_runs" not in insp.get_table_names():
        return
    if "client_id" in {c["name"] for c in insp.get_columns("backtest_runs")}:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE backtest_runs ADD COLUMN client_id VARCHAR(64)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_backtest_runs_client_id "
                "ON backtest_runs (client_id)"
            )
        )
    log.info("db.migrate.client_id_added")
