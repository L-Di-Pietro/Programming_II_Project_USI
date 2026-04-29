"""SQLAlchemy ORM models — the database schema lives here.

Design constraints
------------------
* Must run on **SQLite** (dev) and **Postgres** (prod). No backend-specific
  types. Use ``JSON`` (text-encoded) instead of ``JSONB``; no ``ARRAY``; no
  partitioning DDL.
* All ``DateTime`` columns store timezone-naive UTC.
* Composite primary keys via ``PrimaryKeyConstraint``.
* Foreign keys with ``ON DELETE CASCADE`` so deleting a backtest run cleans up
  its trades, equity points, metrics, and conversations.

Tables
------
* ``assets``            — securities universe
* ``ohlcv_bars``        — historical bars (per asset, per timeframe)
* ``strategies``        — registered strategies and their JSON-Schema params
* ``backtest_runs``     — one row per backtest invocation
* ``trades``            — trade-level ledger
* ``equity_curve``      — equity series per run
* ``metrics``           — long-format KPIs per run
* ``llm_conversations`` — Explanation Agent chat history (empty until LLM is on)
"""

from __future__ import annotations

import sys
from datetime import datetime
from typing import Any

if sys.version_info >= (3, 11):
    from enum import StrEnum
else:
    from enum import Enum

    class StrEnum(str, Enum):
        pass

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.connection import Base


# -----------------------------------------------------------------------------
# Enums (stored as strings — works on both backends)
# -----------------------------------------------------------------------------
class AssetClass(StrEnum):
    EQUITY = "equity"
    CRYPTO = "crypto"
    FX = "fx"
    ETF = "etf"


class Timeframe(StrEnum):
    """Bar timeframe. v1 only uses DAILY; the column exists so intraday is a
    drop-in addition without migration."""
    DAILY = "1d"
    HOURLY = "1h"
    MINUTE = "1m"


class RunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TradeSide(StrEnum):
    BUY = "buy"
    SELL = "sell"


class MetricCategory(StrEnum):
    RETURN = "return"
    RISK = "risk"
    TRADE = "trade"


# -----------------------------------------------------------------------------
# Asset
# -----------------------------------------------------------------------------
class Asset(Base):
    """A tradable instrument. Symbols are unique within an exchange."""

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    asset_class: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # ORM relationships --------------------------------------------------------
    bars: Mapped[list[OHLCVBar]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("symbol", "exchange", name="uq_asset_symbol_exchange"),
    )

    def __repr__(self) -> str:
        return f"<Asset {self.symbol} ({self.asset_class})>"


# -----------------------------------------------------------------------------
# OHLCV bar
# -----------------------------------------------------------------------------
class OHLCVBar(Base):
    """A single bar of price + volume data for a given asset and timeframe.

    The composite PK ``(asset_id, ts, timeframe)`` makes inserts idempotent
    (re-fetching the same bar is a no-op via ``INSERT OR IGNORE`` /
    ``ON CONFLICT DO NOTHING``).
    """

    __tablename__ = "ohlcv_bars"

    asset_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    timeframe: Mapped[str] = mapped_column(String(8), nullable=False, default=Timeframe.DAILY)

    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Provenance — useful when debugging "why does this bar look weird".
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    asset: Mapped[Asset] = relationship(back_populates="bars")

    __table_args__ = (
        PrimaryKeyConstraint("asset_id", "ts", "timeframe", name="pk_ohlcv_bars"),
        Index("ix_ohlcv_asset_ts", "asset_id", "ts"),
    )


# -----------------------------------------------------------------------------
# Strategy registry (mirrors the in-code registry; lets the UI list them)
# -----------------------------------------------------------------------------
class Strategy(Base):
    """A registered strategy. The UI fetches this list to populate the
    "choose a strategy" dropdown and uses ``params_schema`` to render a
    parameter form dynamically."""

    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # JSON Schema — frontend renders this directly into a form.
    params_schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    runs: Mapped[list[BacktestRun]] = relationship(back_populates="strategy")


# -----------------------------------------------------------------------------
# Backtest run
# -----------------------------------------------------------------------------
class BacktestRun(Base):
    """One backtest invocation — config + status + linkage to outputs."""

    __tablename__ = "backtest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("strategies.id"), nullable=False
    )
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(8), nullable=False, default=Timeframe.DAILY)

    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Execution model parameters — captured per-run so reruns are reproducible.
    commission_bps: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    slippage_bps: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    initial_cash: Mapped[float] = mapped_column(Float, nullable=False, default=10_000.0)

    # Lifecycle ---------------------------------------------------------------
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=RunStatus.PENDING)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    strategy: Mapped[Strategy] = relationship(back_populates="runs")
    asset: Mapped[Asset] = relationship()
    trades: Mapped[list[Trade]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    equity_points: Mapped[list[EquityPoint]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    metrics: Mapped[list[Metric]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    conversations: Mapped[list[LLMConversation]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


# -----------------------------------------------------------------------------
# Trade
# -----------------------------------------------------------------------------
class Trade(Base):
    """A filled order. Recorded per leg (entry, exit, partial)."""

    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("backtest_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)  # post-slippage fill price
    commission: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    slippage_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    gross_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    run: Mapped[BacktestRun] = relationship(back_populates="trades")


# -----------------------------------------------------------------------------
# Equity curve point
# -----------------------------------------------------------------------------
class EquityPoint(Base):
    """One row per bar per run — the equity curve."""

    __tablename__ = "equity_curve"

    run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("backtest_runs.id", ondelete="CASCADE"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)
    cash: Mapped[float] = mapped_column(Float, nullable=False)
    position_value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    drawdown_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    run: Mapped[BacktestRun] = relationship(back_populates="equity_points")

    __table_args__ = (PrimaryKeyConstraint("run_id", "ts", name="pk_equity_curve"),)


# -----------------------------------------------------------------------------
# Metric (long format)
# -----------------------------------------------------------------------------
class Metric(Base):
    """KPIs in long format: one row per (run, metric_name).

    Why long? It lets us add new metrics without DDL changes and makes
    cross-run comparisons trivial via plain SQL.
    """

    __tablename__ = "metrics"

    run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("backtest_runs.id", ondelete="CASCADE"), nullable=False
    )
    metric_name: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(16), nullable=False, default=MetricCategory.RETURN)

    run: Mapped[BacktestRun] = relationship(back_populates="metrics")

    __table_args__ = (PrimaryKeyConstraint("run_id", "metric_name", name="pk_metrics"),)


# -----------------------------------------------------------------------------
# LLM conversation
# -----------------------------------------------------------------------------
class LLMConversation(Base):
    """Chat history for the Explanation Agent. Empty in v1 because the LLM is
    disabled by default — populated when ``LLM_ENABLED=true`` and a real
    provider is wired in."""

    __tablename__ = "llm_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("backtest_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # "user" | "assistant" | "system"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    run: Mapped[BacktestRun] = relationship(back_populates="conversations")
