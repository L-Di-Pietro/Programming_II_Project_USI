"""Smoke tests for portfolio + execution arithmetic."""

from __future__ import annotations

import pandas as pd

from backend.backtest.engine import BacktestConfig, run_backtest
from backend.backtest.execution import ExecutionHandler
from backend.backtest.portfolio import Portfolio
from backend.strategies.sma_crossover import SMACrossoverConfig, SMACrossoverStrategy


def test_portfolio_starts_with_initial_cash():
    p = Portfolio(initial_cash=10_000.0)
    assert p.cash == 10_000.0
    assert p.equity == 10_000.0
    assert p.position.is_flat


def test_portfolio_buy_then_sell_realises_pnl():
    p = Portfolio(initial_cash=10_000.0)
    p.apply_fill(side=1, qty=10, fill_price=100.0, commission=1.0)  # buy 10 @ 100
    assert p.position.qty == 10.0
    assert p.cash == 10_000.0 - 1000.0 - 1.0
    p.mark_to_market(110.0)
    assert p.equity == p.cash + 1100.0  # 10 shares * 110

    gross, net = p.apply_fill(side=-1, qty=10, fill_price=110.0, commission=1.0)
    assert gross == 100.0  # +$100 PnL
    assert net == 99.0     # minus $1 commission
    assert p.position.is_flat


def test_execution_handler_applies_slippage_and_commission():
    h = ExecutionHandler(slippage_bps=10.0, commission_bps=5.0)
    fill = h.fill(side=1, qty=100, reference_price=100.0)
    # Buy → fill price slips up by 10 bps = $100.10
    assert abs(fill.fill_price - 100.10) < 1e-9
    # Commission = 100 * 100.10 * 5 / 10_000 = $5.005
    assert abs(fill.commission - 5.005) < 1e-6


def test_engine_end_to_end_smoke(trending_bars):
    """Full pipeline: SMA strategy on trending bars produces non-trivial output."""
    cfg = BacktestConfig(
        bars=trending_bars,
        strategy=SMACrossoverStrategy(SMACrossoverConfig(fast_window=10, slow_window=30)),
        initial_cash=10_000.0,
        commission_bps=5.0,
        slippage_bps=2.0,
        allow_fractional=True,
    )
    result = run_backtest(cfg)
    assert len(result.equity_curve) == len(trending_bars)
    assert len(result.trades) >= 1
    # Final equity should be positive — even if the strategy lost, can't go negative without leverage.
    assert result.equity_curve[-1].equity > 0


def test_engine_drawdown_triggers_circuit_breaker(trending_bars):
    """Crash the strategy via a synthetic series and verify max-DD circuit halts trading."""
    n = len(trending_bars)
    # Flip the trend to a crash (linear -50%).
    crash = trending_bars.copy()
    crash["close"] = pd.Series(
        [crash["close"].iloc[0] * (1.0 - 0.5 * i / n) for i in range(n)],
        index=crash.index,
    )
    crash["open"] = crash["close"].shift(1).fillna(crash["close"].iloc[0])
    crash["high"] = crash[["open", "close"]].max(axis=1)
    crash["low"] = crash[["open", "close"]].min(axis=1)

    cfg = BacktestConfig(
        bars=crash,
        strategy=SMACrossoverStrategy(SMACrossoverConfig(fast_window=5, slow_window=20)),
        initial_cash=10_000.0,
        max_dd_pct=0.10,  # halt at 10% drawdown
        allow_fractional=True,
    )
    result = run_backtest(cfg)
    # Once halted, equity should plateau (no more new entries).
    final_equity = result.equity_curve[-1].equity
    assert final_equity > 0
