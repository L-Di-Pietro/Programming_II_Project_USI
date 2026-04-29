"""Performance metrics — CAGR, Sharpe, Sortino, Calmar, Max DD, trade stats.

Each function has a docstring that states the formula and the citation. We
match the conventions in:

* Bacon, C. (2008). *Practical Portfolio Performance Measurement and
  Attribution*. Wiley.
* Pardo, R. (2008). *The Evaluation and Optimization of Trading Strategies*.

Conventions
-----------
* Returns are computed from the equity curve, not from individual trades.
* Annualization factor is **252** (trading days per year). Override if you
  ever support non-equity calendars in v2.
* Risk-free rate defaults to 0 — appropriate for short backtests where the
  difference is rounding error. Configurable per call.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd


TRADING_DAYS_PER_YEAR = 252


@dataclass(slots=True)
class MetricsResult:
    # Return metrics ---------------------------------------------------------
    total_return_pct: float
    cagr_pct: float
    annualized_volatility_pct: float
    # Risk-adjusted ----------------------------------------------------------
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    # Drawdown ---------------------------------------------------------------
    max_drawdown_pct: float
    max_drawdown_duration_days: int
    # Trade statistics -------------------------------------------------------
    total_trades: int
    win_rate_pct: float
    avg_win: float
    avg_loss: float
    win_loss_ratio: float
    profit_factor: float

    def as_long_rows(self) -> list[tuple[str, float, str]]:
        """Convert to long format ``(metric_name, value, category)`` for the
        ``metrics`` DB table."""
        d = asdict(self)
        return [(k, v, _category(k)) for k, v in d.items()]


def _category(name: str) -> str:
    if name in {"total_return_pct", "cagr_pct", "annualized_volatility_pct"}:
        return "return"
    if name in {
        "sharpe_ratio", "sortino_ratio", "calmar_ratio",
        "max_drawdown_pct", "max_drawdown_duration_days",
    }:
        return "risk"
    return "trade"


# -----------------------------------------------------------------------------
# Top-level function
# -----------------------------------------------------------------------------
def compute_metrics(
    equity: pd.Series,
    trade_pnls: pd.Series | None = None,
    risk_free_rate: float = 0.0,
) -> MetricsResult:
    """Compute every KPI given an equity curve and (optionally) a trade-PnL
    series.

    Parameters
    ----------
    equity
        Equity values indexed by ``DatetimeIndex`` (one point per bar).
    trade_pnls
        Per-trade net PnL series. Used for trade statistics. Pass ``None`` to
        zero out the trade-stat block.
    risk_free_rate
        Annual risk-free rate (e.g. ``0.04`` for 4 %). Default 0.
    """
    if equity.empty or len(equity) < 2:
        return _zero_metrics(num_trades=0 if trade_pnls is None else len(trade_pnls))

    returns = equity.pct_change().dropna()

    total_return = equity.iloc[-1] / equity.iloc[0] - 1.0
    cagr = _cagr(equity)
    ann_vol = _annualized_vol(returns)
    sharpe = _sharpe(returns, risk_free_rate)
    sortino = _sortino(returns, risk_free_rate)
    max_dd, max_dd_dur = _max_drawdown(equity)
    calmar = (cagr / abs(max_dd)) if max_dd not in (0.0, None) else float("inf") if cagr > 0 else 0.0

    if trade_pnls is None or trade_pnls.empty:
        total_trades = 0
        win_rate = avg_win = avg_loss = wlr = pf = 0.0
    else:
        total_trades = int(len(trade_pnls))
        wins = trade_pnls[trade_pnls > 0]
        losses = trade_pnls[trade_pnls < 0]
        win_rate = len(wins) / total_trades * 100.0 if total_trades else 0.0
        avg_win = float(wins.mean()) if len(wins) else 0.0
        avg_loss = float(losses.mean()) if len(losses) else 0.0
        wlr = (avg_win / abs(avg_loss)) if avg_loss != 0 else float("inf") if avg_win > 0 else 0.0
        gross_profit = float(wins.sum()) if len(wins) else 0.0
        gross_loss = float(-losses.sum()) if len(losses) else 0.0
        pf = (gross_profit / gross_loss) if gross_loss > 0 else float("inf") if gross_profit > 0 else 0.0

    return MetricsResult(
        total_return_pct=total_return * 100.0,
        cagr_pct=cagr * 100.0,
        annualized_volatility_pct=ann_vol * 100.0,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        calmar_ratio=calmar,
        max_drawdown_pct=max_dd * 100.0,
        max_drawdown_duration_days=max_dd_dur,
        total_trades=total_trades,
        win_rate_pct=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        win_loss_ratio=wlr,
        profit_factor=pf,
    )


# -----------------------------------------------------------------------------
# Building blocks (kept module-private but readable for unit tests)
# -----------------------------------------------------------------------------
def _cagr(equity: pd.Series) -> float:
    """Compound Annual Growth Rate.

    CAGR = (V_end / V_start) ^ (1 / years) − 1.

    ``years`` is computed from the first and last timestamps, so an irregular
    calendar (e.g. weekend gaps) does not bias the result.
    """
    if len(equity) < 2 or equity.iloc[0] <= 0:
        return 0.0
    days = (equity.index[-1] - equity.index[0]).days
    if days <= 0:
        return 0.0
    years = days / 365.25
    return float((equity.iloc[-1] / equity.iloc[0]) ** (1.0 / years) - 1.0)


def _annualized_vol(returns: pd.Series) -> float:
    """Annualised standard deviation of *daily* returns."""
    if returns.empty:
        return 0.0
    return float(returns.std(ddof=1) * math.sqrt(TRADING_DAYS_PER_YEAR))


def _sharpe(returns: pd.Series, risk_free_rate: float) -> float:
    """Sharpe ratio.

    Sharpe = (mean(R) − r_f / 252) / std(R)  × √252.
    """
    if returns.empty:
        return 0.0
    daily_rf = risk_free_rate / TRADING_DAYS_PER_YEAR
    excess = returns - daily_rf
    std = excess.std(ddof=1)
    if std == 0 or math.isnan(std):
        return 0.0
    return float(excess.mean() / std * math.sqrt(TRADING_DAYS_PER_YEAR))


def _sortino(returns: pd.Series, risk_free_rate: float) -> float:
    """Sortino ratio — like Sharpe but penalises only downside volatility.

    Sortino = (mean(R) − r_f / 252) / std(min(R, 0))  × √252.

    Source: Bacon (2008), §6.4.
    """
    if returns.empty:
        return 0.0
    daily_rf = risk_free_rate / TRADING_DAYS_PER_YEAR
    excess = returns - daily_rf
    downside = excess.clip(upper=0.0)
    downside_std = downside.std(ddof=1)
    if downside_std == 0 or math.isnan(downside_std):
        return 0.0 if excess.mean() <= 0 else float("inf")
    return float(excess.mean() / downside_std * math.sqrt(TRADING_DAYS_PER_YEAR))


def _max_drawdown(equity: pd.Series) -> tuple[float, int]:
    """Maximum peak-to-trough drawdown and its duration in calendar days.

    Returns a (negative-or-zero) fraction and a non-negative integer number
    of days. Duration is measured from peak to recovery (or to series end if
    no recovery happened).
    """
    if equity.empty:
        return 0.0, 0
    rolling_peak = equity.cummax()
    drawdowns = (equity - rolling_peak) / rolling_peak
    max_dd = float(drawdowns.min())  # negative number
    if max_dd >= 0:
        return 0.0, 0
    # Find peak before the trough, and recovery (first time we hit peak again).
    trough_idx = drawdowns.idxmin()
    pre_trough = equity.loc[:trough_idx]
    peak_idx = pre_trough.idxmax()
    post_trough = equity.loc[trough_idx:]
    recovery = post_trough[post_trough >= equity.loc[peak_idx]]
    end_idx = recovery.index[0] if not recovery.empty else equity.index[-1]
    duration_days = int((end_idx - peak_idx).days)
    return max_dd, duration_days


def _zero_metrics(num_trades: int) -> MetricsResult:
    return MetricsResult(
        total_return_pct=0.0,
        cagr_pct=0.0,
        annualized_volatility_pct=0.0,
        sharpe_ratio=0.0,
        sortino_ratio=0.0,
        calmar_ratio=0.0,
        max_drawdown_pct=0.0,
        max_drawdown_duration_days=0,
        total_trades=num_trades,
        win_rate_pct=0.0,
        avg_win=0.0,
        avg_loss=0.0,
        win_loss_ratio=0.0,
        profit_factor=0.0,
    )


# -----------------------------------------------------------------------------
# Auxiliary: monthly returns table (used by the heatmap)
# -----------------------------------------------------------------------------
def monthly_returns(equity: pd.Series) -> pd.DataFrame:
    """Return a Year × Month DataFrame of percentage returns.

    Used directly by ``visualizations.build_monthly_heatmap``. Months with no
    bars are NaN.
    """
    if equity.empty:
        return pd.DataFrame()
    monthly = equity.resample("ME").last().pct_change().dropna() * 100.0
    if monthly.empty:
        return pd.DataFrame()
    return monthly.to_frame("ret").assign(
        year=lambda x: x.index.year,
        month=lambda x: x.index.month,
    ).pivot(index="year", columns="month", values="ret")
