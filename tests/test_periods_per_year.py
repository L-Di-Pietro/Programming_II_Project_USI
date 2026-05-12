"""Lookup table for annualization periods per (timeframe, asset_class)."""

from __future__ import annotations

import pytest

from backend.analytics.periods import periods_per_year


@pytest.mark.parametrize(
    "timeframe,asset_class,expected",
    [
        ("1d", "equity", 252.0),
        ("1d", "etf", 252.0),
        ("1d", "fx", 260.0),
        ("1d", "crypto", 365.0),
        ("1h", "equity", 1638.0),
        ("1h", "etf", 1638.0),
        ("1h", "fx", 6240.0),
        ("1h", "crypto", 8760.0),
    ],
)
def test_periods_per_year_lookup(timeframe, asset_class, expected):
    assert periods_per_year(timeframe, asset_class) == expected


def test_periods_per_year_case_insensitive_asset_class():
    assert periods_per_year("1d", "EQUITY") == 252.0
    assert periods_per_year("1h", "Crypto") == 8760.0


def test_periods_per_year_raises_on_unknown():
    with pytest.raises(ValueError, match="No periods_per_year mapping"):
        periods_per_year("5m", "equity")
    with pytest.raises(ValueError):
        periods_per_year("1d", "commodity")
