"""Pydantic schemas — the API contract.

These models define every request and response payload. The frontend's
TypeScript types are generated from this file's OpenAPI dump (run
``npm run gen:types`` in ``frontend/``).

Don't add backend logic here — schemas are pure data carriers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer


def _serialize_utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    iso = dt.isoformat()
    return iso[:-6] + "Z" if iso.endswith("+00:00") else iso


# DB columns are stored as naive UTC (see CLAUDE.md). This annotation makes
# JSON serialization explicit so browsers parse the timestamp as UTC and
# convert to local time, instead of guessing the wall-clock zone.
UtcDatetime = Annotated[
    datetime, PlainSerializer(_serialize_utc, return_type=str, when_used="json")
]


class Timeframe(str, Enum):
    """Bar resolution supported by the API. Mirrors the DB enum but only
    exposes the timeframes a user can actually request (no minute bars yet)."""
    DAILY = "1d"
    HOURLY = "1h"


# -----------------------------------------------------------------------------
# Shared mixins
# -----------------------------------------------------------------------------
class ORMBase(BaseModel):
    """Base for response models that wrap SQLAlchemy ORM rows."""
    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str = "ok"
    llm_enabled: bool
    llm_provider: str


# -----------------------------------------------------------------------------
# Assets
# -----------------------------------------------------------------------------
class AssetOut(ORMBase):
    id: int
    symbol: str
    asset_class: str
    name: str
    exchange: str
    currency: str
    is_active: bool


class RefreshResponse(BaseModel):
    symbol: str
    rows_written: int
    last_ts: UtcDatetime | None


# -----------------------------------------------------------------------------
# Strategies
# -----------------------------------------------------------------------------
class StrategyOut(BaseModel):
    slug: str
    name: str
    description: str
    category: str
    params_schema: dict[str, Any]


# -----------------------------------------------------------------------------
# Backtests
# -----------------------------------------------------------------------------
class BacktestRequest(BaseModel):
    """Submit a backtest run."""
    asset_symbol: str = Field(..., description="Symbol of the asset to test on (e.g. AAPL).")
    strategy_slug: str = Field(..., description="Identifier of a registered strategy.")
    start_date: datetime
    end_date: datetime
    params: dict[str, Any] = Field(default_factory=dict)
    initial_cash: float = Field(default=10_000.0, gt=0)
    commission_bps: float = Field(default=5.0, ge=0)
    slippage_bps: float = Field(default=2.0, ge=0)
    risk_fraction: float = Field(default=1.0, gt=0, le=1.0)
    sizing_mode: str = Field(default="fixed_fraction")
    max_dd_pct: float | None = Field(default=None, ge=0, le=1.0)
    timeframe: Timeframe = Field(
        default=Timeframe.DAILY,
        description="Bar resolution. Hourly history is limited to ~730 days for equity/FX.",
    )


class BacktestSummary(ORMBase):
    id: int
    strategy_id: int
    strategy_name: str
    asset_id: int
    asset_symbol: str
    timeframe: str
    start_date: UtcDatetime
    end_date: UtcDatetime
    status: str
    error_message: str | None = None
    created_at: UtcDatetime
    completed_at: UtcDatetime | None = None


class TradeOut(ORMBase):
    id: int
    ts: UtcDatetime
    side: str
    qty: float
    price: float
    commission: float
    slippage_cost: float
    gross_pnl: float
    net_pnl: float


class EquityPointOut(ORMBase):
    ts: UtcDatetime
    equity: float
    cash: float
    position_value: float
    drawdown_pct: float


class MetricsOut(BaseModel):
    """Metrics grouped by category — matches the AnalyticsAgent output shape."""
    return_metrics: dict[str, float] = Field(default_factory=dict, alias="return")
    risk: dict[str, float] = Field(default_factory=dict)
    trade: dict[str, float] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class ChartResponse(BaseModel):
    """Plotly figure dict — the frontend hands this straight to react-plotly."""
    figure: dict[str, Any]


# -----------------------------------------------------------------------------
# Explanation (LLM)
# -----------------------------------------------------------------------------
class ExplainRequest(BaseModel):
    op: str = Field(..., description="explain_metric | explain_strategy | compare_runs | answer_question")
    run_id: int | None = None
    other_run_id: int | None = None
    metric_name: str | None = None
    strategy_slug: str | None = None
    user_question: str | None = None


class ExplainResponse(BaseModel):
    op: str
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    demo_mode: bool


# -----------------------------------------------------------------------------
# Backtest report (LLM-generated post-run summary)
# -----------------------------------------------------------------------------
class ReportResponse(BaseModel):
    """Markdown-formatted post-backtest report. ``cached`` is True when the
    payload came from the LLMConversation cache (no LLM call was made)."""
    text: str
    model: str
    demo_mode: bool
    generated_at: UtcDatetime
    cached: bool
    prompt_tokens: int = 0
    completion_tokens: int = 0
