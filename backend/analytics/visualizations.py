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

from typing import Any

import pandas as pd
import plotly.graph_objects as go

from backend.analytics.metrics import monthly_returns


# -----------------------------------------------------------------------------
# Equity curve
# -----------------------------------------------------------------------------
def build_equity_figure(equity: pd.Series) -> dict[str, Any]:
    """A simple line chart of equity over time."""
    fig = go.Figure(
        data=[
            go.Scatter(
                x=equity.index,
                y=equity.values,
                mode="lines",
                name="Equity",
                line=dict(width=2),
                hovertemplate="%{x|%Y-%m-%d}<br>Equity: $%{y:,.2f}<extra></extra>",
            )
        ]
    )
    fig.update_layout(
        title="Equity Curve",
        xaxis_title="Date",
        yaxis_title="Equity ($)",
        margin=dict(l=40, r=20, t=40, b=40),
        showlegend=False,
        template="plotly_white",
    )
    import json
    return json.loads(fig.to_json())


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
                line=dict(color="#d62728", width=1),
                fillcolor="rgba(214,39,40,0.3)",
                hovertemplate="%{x|%Y-%m-%d}<br>Drawdown: %{y:.2f}%<extra></extra>",
            )
        ]
    )
    fig.update_layout(
        title="Underwater (Drawdown) Curve",
        xaxis_title="Date",
        yaxis_title="Drawdown (%)",
        yaxis=dict(rangemode="tozero"),
        margin=dict(l=40, r=20, t=40, b=40),
        template="plotly_white",
    )
    import json
    return json.loads(fig.to_json())


# -----------------------------------------------------------------------------
# Monthly returns heatmap
# -----------------------------------------------------------------------------
_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def build_monthly_heatmap(equity: pd.Series) -> dict[str, Any]:
    """Year × Month grid of returns. Diverging colour scale around 0."""
    table = monthly_returns(equity)
    if table.empty:
        return go.Figure().to_dict()

    # Reindex columns 1..12 so empty months show up as NaN cells.
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
        title="Monthly Returns (%)",
        xaxis_title="Month",
        yaxis_title="Year",
        margin=dict(l=40, r=20, t=40, b=40),
        template="plotly_white",
    )
    import json
    return json.loads(fig.to_json())
