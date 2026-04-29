"""Centralised configuration via Pydantic Settings.

All env-driven values flow through this module. Code elsewhere imports
``settings`` and reads attributes — never ``os.getenv`` directly. This way:

1. Defaults are in one place.
2. Types are validated at startup, not at first use.
3. Tests can swap settings via ``Settings(...)`` without touching the env.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import structlog
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Anchor relative paths (e.g. SQLite file) at the project root, regardless of cwd.
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration. Values come from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Database ------------------------------------------------------------
    # SQLAlchemy URL. SQLite for dev, Postgres in prod (psycopg dialect):
    #   sqlite:///./quantbacktest.db
    #   postgresql+psycopg://user:pass@host:5432/db
    database_url: str = Field(default="sqlite:///./quantbacktest.db")

    # --- API server ----------------------------------------------------------
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    log_level: str = "INFO"

    # --- Frontend ------------------------------------------------------------
    frontend_api_url: str = "http://127.0.0.1:8000"

    # --- Data fetcher tuning -------------------------------------------------
    data_fetch_retry_max: int = 4
    data_fetch_retry_backoff_s: float = 2.0
    nightly_refresh_hour_utc: int = 23  # 0–23

    # --- LLM (deferred) ------------------------------------------------------
    # When LLM_ENABLED=false the Explanation Agent uses NullProvider — no
    # external calls, deterministic canned text. Activating Gemini is a single
    # env-var change once GeminiProvider.generate is implemented.
    llm_enabled: bool = False
    llm_provider: str = "null"  # null | gemini | (future: anthropic, openai)
    llm_model: str = "gemini-1.5-flash"
    gemini_api_key: str = ""
    llm_max_tokens: int = 1024
    llm_temperature: float = 0.2

    # --- Backtest engine defaults --------------------------------------------
    default_initial_cash: float = 10_000.0
    default_commission_bps: float = 5.0  # 0.05 %
    default_slippage_bps: float = 2.0    # 0.02 %


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance (cached so we read .env once)."""
    return Settings()


# Convenient module-level alias. Most code does ``from backend.config import settings``.
settings = get_settings()


# -----------------------------------------------------------------------------
# Logging configuration — call once at app startup.
# -----------------------------------------------------------------------------
def configure_logging(level: str | None = None) -> None:
    """Configure ``structlog`` to emit pretty colourised logs in dev and JSON
    in prod. The level can be overridden via the LOG_LEVEL env var."""
    log_level = (level or settings.log_level).upper()
    logging.basicConfig(level=log_level, format="%(message)s")

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level)),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
