"""Plotly figure-builders.

These functions produce **Plotly figure dicts** (already serialised to plain
JSON-friendly Python dicts) so the FastAPI layer can return them directly
and the frontend can hand them to react-plotly without further work.

Why server-side?
The chart is *part of the analytics output*, not a UI concern. Building the
figure on the backend lets us snapshot it next to the metrics in tests,
reproduces correctly across UI rewrites, and keeps the frontend stateless.
"""

from __future__ import annotations

import json
import math
from typing import Any

import pandas as pd
import plotly.graph_objects as go

from backend.analytics.metrics import monthly_returns


# -----------------------------------------------------------------------------
# Equity curve
# -----------------------------------------------------------------------------
# Palette for benchmark traces. Keys must match BenchmarkKind values so the
# analytics layer can look them up without a translation table.
_BENCHMARK_STYLE: dict[str, dict[str, str]] = {
    "asset_buyhold": {"color": "#f0c674"},  # amber/yellow
    "spy_buyhold":   {"color": "#9ca3af"},  # muted gray
}


def build_equity_figure(
    equity: pd.Series,
    benchmarks: dict[str, pd.Series] | None = None,
    benchmark_labels: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Cyan line + subtle fill of equity, with optional benchmark overlays.

    Parameters
    ----------
    equity
        Strategy equity series — drawn as the cyan headline trace.
    benchmarks
        Optional ``{kind: series}`` map. ``kind`` matches the
        ``BenchmarkKind`` enum (``"asset_buyhold"`` / ``"spy_buyhold"``).
        Empty / ``None`` series are silently skipped.
    benchmark_labels
        Optional ``{kind: legend label}`` map. Falls back to a sensible
        default if not provided.
    """
    traces: list[Any] = [
        go.Scatter(
            x=equity.index,
            y=equity.values,
            mode="lines",
            name="Strategy",
            line=dict(color="#22d3ee", width=2),
            fill="tozeroy",
            fillcolor="rgba(34, 211, 238, 0.08)",
            hovertemplate="%{x|%Y-%m-%d}<br>$%{y:,.0f}<extra></extra>",
        )
    ]

    if benchmarks:
        labels = benchmark_labels or {}
        for kind, series in benchmarks.items():
            if series is None or series.empty:
                continue
            style = _BENCHMARK_STYLE.get(kind, {"color": "#9ca3af"})
            label = labels.get(kind, _default_benchmark_label(kind))
            traces.append(
                go.Scatter(
                    x=series.index,
                    y=series.values,
                    mode="lines",
                    name=label,
                    line=dict(color=style["color"], width=1.5),
                    opacity=0.85,
                    hovertemplate="%{x|%Y-%m-%d}<br>$%{y:,.0f}<extra></extra>",
                )
            )

    fig = go.Figure(data=traces)
    fig.update_layout(
        title="",
        xaxis=dict(tickformat="%Y-%m"),
        yaxis=dict(tickprefix="$", tickformat="~s"),
        showlegend=True,
        legend=dict(x=1, xanchor="right", y=1, yanchor="top", bgcolor="rgba(0,0,0,0)"),
        margin=dict(l=60, r=16, t=16, b=40),
        template=None,
    )
    return json.loads(fig.to_json())


def _default_benchmark_label(kind: str) -> str:
    if kind == "asset_buyhold":
        return "Buy & Hold"
    if kind == "spy_buyhold":
        return "Buy & Hold SPY"
    return kind


# -----------------------------------------------------------------------------
# Underwater / drawdown
# -----------------------------------------------------------------------------
def build_drawdown_figure(equity: pd.Series) -> dict[str, Any]:
    """The "underwater" curve — equity below all-time-high, expressed as %."""
    if equity.empty:
        return go.Figure().to_dict()
    rolling_peak = equity.cummax()
    drawdown_pct = (equity / rolling_peak - 1.0) * 100.0
    fig = go.Figure(
        data=[
            go.Scatter(
                x=drawdown_pct.index,
                y=drawdown_pct.values,
                mode="lines",
                fill="tozeroy",
                line=dict(color="#f85149", width=1.5),
                fillcolor="rgba(248, 81, 73, 0.12)",
                hovertemplate="%{x|%Y-%m-%d}<br>%{y:.1f}%<extra></extra>",
            )
        ]
    )
    fig.update_layout(
        title="",
        yaxis=dict(ticksuffix="%", rangemode="tozero"),
        margin=dict(l=60, r=16, t=16, b=40),
        template=None,
    )
    return json.loads(fig.to_json())


# -----------------------------------------------------------------------------
# Monthly returns heatmap (kept for API compatibility; frontend now renders
# the HTML table from raw equity data instead of this figure)
# -----------------------------------------------------------------------------
_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def build_monthly_heatmap(equity: pd.Series) -> dict[str, Any]:
    """Year × Month grid of returns. Kept for API compatibility."""
    table = monthly_returns(equity)
    if table.empty:
        return go.Figure().to_dict()
    table = table.reindex(columns=range(1, 13))
    fig = go.Figure(
        data=go.Heatmap(
            z=table.values,
            x=_MONTH_LABELS,
            y=table.index.astype(str),
            colorscale="RdYlGn",
            zmid=0,
            colorbar=dict(title="Return (%)"),
            hovertemplate="%{y}-%{x}<br>Return: %{z:.2f}%<extra></extra>",
        )
    )
    fig.update_layout(
        title="",
        margin=dict(l=40, r=20, t=16, b=40),
        template=None,
    )
    return json.loads(fig.to_json())


# -----------------------------------------------------------------------------
# Trade P&L scatter
# -----------------------------------------------------------------------------
def build_trade_pnl_figure(net_pnl_values: list[float]) -> dict[str, Any]:
    """Scatter of per-trade net P&L — green for wins, red for losses."""
    if not net_pnl_values:
        return go.Figure().to_dict()

    wins_x   = [i for i, v in enumerate(net_pnl_values) if v > 0]
    wins_y   = [v for v in net_pnl_values if v > 0]
    losses_x = [i for i, v in enumerate(net_pnl_values) if v <= 0]
    losses_y = [v for v in net_pnl_values if v <= 0]

    fig = go.Figure(data=[
        go.Scatter(
            x=wins_x, y=wins_y,
            mode="markers",
            name="Win",
            marker=dict(color="#3fb950", size=6),
            hovertemplate="Trade #%{x}<br>P&L: $%{y:,.2f}<extra></extra>",
        ),
        go.Scatter(
            x=losses_x, y=losses_y,
            mode="markers",
            name="Loss",
            marker=dict(color="#f85149", size=6),
            hovertemplate="Trade #%{x}<br>P&L: $%{y:,.2f}<extra></extra>",
        ),
    ])
    fig.update_layout(
        title="",
        showlegend=False,
        margin=dict(l=60, r=16, t=16, b=40),
        template=None,
        shapes=[dict(
            type="line", xref="paper", yref="y",
            x0=0, x1=1, y0=0, y1=0,
            line=dict(color="#30363d", width=1, dash="dot"),
        )],
    )
    return json.loads(fig.to_json())


# -----------------------------------------------------------------------------
# Rolling Sharpe
# -----------------------------------------------------------------------------
def build_rolling_sharpe_figure(equity: pd.Series, window: int = 42) -> dict[str, Any]:
    """Rolling annualised Sharpe ratio over a trailing window of daily returns."""
    if equity.empty or len(equity) < window + 1:
        return go.Figure().to_dict()

    daily_ret = equity.pct_change().dropna()
    roll_mean = daily_ret.rolling(window).mean()
    roll_std  = daily_ret.rolling(window).std()
    sharpe    = (roll_mean / roll_std.replace(0, float("nan"))) * math.sqrt(252)
    sharpe    = sharpe.dropna()

    fig = go.Figure(data=[
        go.Scatter(
            x=sharpe.index,
            y=sharpe.values,
            mode="lines",
            name="Rolling Sharpe",
            line=dict(color="#22d3ee", width=1.5),
            hovertemplate="%{x|%Y-%m-%d}<br>Sharpe: %{y:.2f}<extra></extra>",
        )
    ])
    fig.update_layout(
        title="",
        showlegend=False,
        margin=dict(l=60, r=16, t=16, b=40),
        template=None,
        shapes=[
            dict(
                type="line", xref="paper", yref="y",
                x0=0, x1=1, y0=0, y1=0,
                line=dict(color="#30363d", width=1, dash="dash"),
            ),
            dict(
                type="line", xref="paper", yref="y",
                x0=0, x1=1, y0=1, y1=1,
                line=dict(color="#3fb950", width=1, dash="dash"),
            ),
        ],
    )
    return json.loads(fig.to_json())
