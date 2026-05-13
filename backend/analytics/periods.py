"""Annualization periods per (timeframe, asset_class).

Used by Sharpe/Sortino/annualized-vol scaling and by VOL_TARGET sizing in
``backend.backtest.risk``. Replaces the old hardcoded ``252`` so that
metrics scale correctly when bars are sub-daily.

Conventions
-----------
* Daily equity/ETF: 252 NYSE trading days/year.
* Daily FX: 260 ≈ 52 weeks × 5 weekdays.
* Daily crypto: 365 — trades 24/7.
* Hourly equity/ETF: 252 × 6.5 = 1638. The 6.5 is *elapsed market hours*
  per session (NYSE regular hours 09:30–16:00 ET); one hourly bar is
  treated as ≈ 1 hour of market activity. This matches the standard
  equity-vol annualization convention used in industry. A literal bar
  count would give 252 × 7 = 1764; the difference reflects the 30-min
  half-hour at the start of the session.
* Hourly FX: 260 × 24 = 6240 — 24 hours × 5 weekdays × 52 weeks.
* Hourly crypto: 365 × 24 = 8760 — 24 hours × 365 days.
"""

from __future__ import annotations

_TABLE: dict[tuple[str, str], float] = {
    ("1d", "equity"): 252.0,
    ("1d", "etf"): 252.0,
    ("1d", "fx"): 260.0,
    ("1d", "crypto"): 365.0,
    ("1h", "equity"): 1638.0,
    ("1h", "etf"): 1638.0,
    ("1h", "fx"): 6240.0,
    ("1h", "crypto"): 8760.0,
}


def periods_per_year(timeframe: str, asset_class: str) -> float:
    """Bars per calendar year for the given (timeframe, asset_class).

    Raises ``ValueError`` for unsupported combinations.
    """
    key = (timeframe, asset_class.lower())
    try:
        return _TABLE[key]
    except KeyError as e:
        raise ValueError(
            f"No periods_per_year mapping for timeframe={timeframe!r}, "
            f"asset_class={asset_class!r}"
        ) from e
