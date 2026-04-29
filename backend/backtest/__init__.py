"""Backtest package — event-driven engine and its sub-components.

Public entrypoint: ``run_backtest(config) -> BacktestResult``.
"""

from backend.backtest.engine import BacktestConfig, BacktestEngine, BacktestResult, run_backtest
from backend.backtest.execution import ExecutionHandler, FillResult
from backend.backtest.portfolio import Portfolio, Position
from backend.backtest.risk import RiskManager, SizingMode

__all__ = [
    "BacktestConfig",
    "BacktestEngine",
    "BacktestResult",
    "ExecutionHandler",
    "FillResult",
    "Portfolio",
    "Position",
    "RiskManager",
    "SizingMode",
    "run_backtest",
]
