"""Benchmark equity-curve computation.

For every strategy run, the analytics layer wants two reference curves to
draw on top of the strategy's equity chart:

1. **Same-asset buy-and-hold** — "would I have done better just holding
   the thing the strategy is trading?" Run with the same commission,
   slippage, sizing, and fractional rules the strategy paid.
2. **SPY buy-and-hold** — "would I have done better in a broad index?"

Approach
--------
Reuse the existing ``BacktestEngine`` with a one-bar-all-ones
``BuyAndHoldStrategy``. This pays the same frictions and respects the
same t→t+1 fill discipline — no parallel implementation to keep in sync.

SPY alignment
-------------
Crypto/FX assets trade on calendars where SPY does not (weekends, US
holidays). We reindex SPY's OHLCV onto the strategy's bar index with
``ffill`` so all three series share one x-axis. This applies to ``open``
too: on a closed-market bar the engine's "buy at next open" semantically
uses the prior session's close as the open. For a visual overlay this is
honest enough; benchmark-relative KPIs (alpha/beta) would need a more
careful treatment and are explicitly out of scope.
"""

from __future__ import annotations

import pandas as pd
import structlog

from backend.backtest.engine import BacktestConfig, BacktestResult, run_backtest
from backend.strategies.buy_and_hold import BuyAndHoldStrategy

log = structlog.get_logger(__name__)


def _result_to_series(result: BacktestResult, name: str) -> pd.Series:
    """Flatten a ``BacktestResult.equity_curve`` to a named ``pd.Series``."""
    if not result.equity_curve:
        return pd.Series(dtype=float, name=name)
    return pd.Series(
        [e.equity for e in result.equity_curve],
        index=pd.DatetimeIndex([e.ts for e in result.equity_curve], name="ts"),
        name=name,
    )


def _cfg_from_template(bars: pd.DataFrame, template: BacktestConfig) -> BacktestConfig:
    """Build a benchmark BacktestConfig that copies ``template``'s frictions
    but swaps in ``BuyAndHoldStrategy`` and the supplied bars."""
    return BacktestConfig(
        bars=bars,
        strategy=BuyAndHoldStrategy(),
        initial_cash=template.initial_cash,
        commission_bps=template.commission_bps,
        slippage_bps=template.slippage_bps,
        sizing_mode=template.sizing_mode,
        risk_fraction=template.risk_fraction,
        vol_target_annual=template.vol_target_annual,
        vol_lookback=template.vol_lookback,
        max_dd_pct=None,
        allow_fractional=template.allow_fractional,
        periods_per_year=template.periods_per_year,
    )


def compute_same_asset_buyhold(
    bars: pd.DataFrame,
    cfg_template: BacktestConfig,
) -> pd.Series:
    """Equity curve of buying-and-holding the strategy's own asset.

    Uses the same engine + frictions the strategy used, so the comparison
    is apples-to-apples.
    """
    if bars.empty:
        return pd.Series(dtype=float, name="asset_buyhold")
    result = run_backtest(_cfg_from_template(bars, cfg_template))
    return _result_to_series(result, "asset_buyhold")


def compute_spy_buyhold(
    strategy_bars: pd.DataFrame,
    spy_bars: pd.DataFrame,
    cfg_template: BacktestConfig,
) -> pd.Series:
    """Equity curve of buying-and-holding SPY, on the strategy's calendar.

    ``spy_bars`` is reindexed onto ``strategy_bars.index`` with a forward
    fill so closed-market bars (weekends, US holidays) repeat the last
    SPY close. Leading NaN — if SPY's first bar is after the strategy's
    first bar — is dropped from the resulting series before the engine
    runs, so the SPY equity curve simply starts later in that case.
    """
    if strategy_bars.empty or spy_bars.empty:
        return pd.Series(dtype=float, name="spy_buyhold")

    spy_aligned = spy_bars.reindex(strategy_bars.index).ffill()
    spy_aligned = spy_aligned.dropna(how="any")
    if spy_aligned.empty:
        log.warning(
            "benchmarks.spy.no_overlap",
            strategy_range=(strategy_bars.index[0], strategy_bars.index[-1]),
            spy_range=(spy_bars.index[0], spy_bars.index[-1]),
        )
        return pd.Series(dtype=float, name="spy_buyhold")

    result = run_backtest(_cfg_from_template(spy_aligned, cfg_template))
    return _result_to_series(result, "spy_buyhold")
