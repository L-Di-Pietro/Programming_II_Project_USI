"""Analytics package — KPIs and chart payload builders.

The analytics layer is pure-functional: given an equity curve and a trade
ledger, produce metrics and Plotly figure JSON. No side effects, no DB.
"""

from backend.analytics.metrics import MetricsResult, compute_metrics
from backend.analytics.visualizations import (
    build_drawdown_figure,
    build_equity_figure,
    build_monthly_heatmap,
)

__all__ = [
    "MetricsResult",
    "build_drawdown_figure",
    "build_equity_figure",
    "build_monthly_heatmap",
    "compute_metrics",
]
