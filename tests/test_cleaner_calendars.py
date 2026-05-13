"""Verify each (calendar, timeframe) target-index builder.

Boundary checks are the point: we want to know that crypto weekends are
kept, FX weekends collapse correctly, and NYSE intraday timestamps land
at half-past hours inside the regular session.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from backend.data.cleaner import OHLCVCleaner


WEEK_START = datetime(2024, 1, 1)   # Mon
WEEK_END = datetime(2024, 1, 8)     # following Mon


def test_nyse_daily_excludes_weekends():
    c = OHLCVCleaner(calendar="nyse", timeframe="1d")
    idx = c._target_index(WEEK_START, WEEK_END)
    # 2024-01-01 is a NYSE holiday (New Year's Day) — closed.
    # 2024-01-02 (Tue) is the first session.
    assert pd.Timestamp("2024-01-02") in idx
    # Saturday Jan 6 is never an NYSE session.
    assert pd.Timestamp("2024-01-06") not in idx


def test_nyse_hourly_inside_session_only():
    c = OHLCVCleaner(calendar="nyse", timeframe="1h")
    idx = c._target_index(WEEK_START, WEEK_END)
    # NYSE regular hours 9:30–16:00 ET. In January (EST = UTC−5), that's
    # 14:30–21:00 UTC. With freq=1h inclusive='left' we get 7 stamps per
    # regular session: 14:30 .. 20:30 UTC.
    assert pd.Timestamp("2024-01-02 14:30") in idx
    assert pd.Timestamp("2024-01-02 20:30") in idx
    # 17:00 ET (22:00 UTC) is after close — must NOT be in index.
    assert pd.Timestamp("2024-01-02 22:00") not in idx
    # Saturday and Sunday — no sessions.
    assert pd.Timestamp("2024-01-06 14:30") not in idx
    assert pd.Timestamp("2024-01-07 14:30") not in idx


def test_crypto_daily_keeps_weekends():
    c = OHLCVCleaner(calendar="24x7", timeframe="1d")
    idx = c._target_index(WEEK_START, WEEK_END)
    # Crypto trades 24/7 — every day, including Sat and Sun, must be present.
    assert pd.Timestamp("2024-01-06") in idx
    assert pd.Timestamp("2024-01-07") in idx


def test_crypto_hourly_keeps_all_hours():
    c = OHLCVCleaner(calendar="24x7", timeframe="1h")
    idx = c._target_index(WEEK_START, WEEK_END)
    # Every hour of every day must be present.
    assert pd.Timestamp("2024-01-06 03:00") in idx
    assert pd.Timestamp("2024-01-07 12:00") in idx
    assert pd.Timestamp("2024-01-01 00:00") in idx


def test_fx_daily_is_business_days():
    c = OHLCVCleaner(calendar="24x5", timeframe="1d")
    idx = c._target_index(WEEK_START, WEEK_END)
    assert pd.Timestamp("2024-01-02") in idx  # Tuesday
    assert pd.Timestamp("2024-01-06") not in idx  # Saturday
    assert pd.Timestamp("2024-01-07") not in idx  # Sunday


def test_fx_hourly_closed_window():
    """Interbank FX window: Sun 22:00 UTC → Fri 22:00 UTC.

    The closed window in UTC is Fri 22:00 (inclusive) → Sun 22:00 (exclusive).
    """
    c = OHLCVCleaner(calendar="24x5", timeframe="1h")
    idx = c._target_index(WEEK_START, WEEK_END)
    # Sunday Jan 7 at 23:00 UTC — open (Sydney session has started).
    assert pd.Timestamp("2024-01-07 23:00") in idx
    # Saturday and Sunday daytime — closed.
    assert pd.Timestamp("2024-01-06 12:00") not in idx
    assert pd.Timestamp("2024-01-07 12:00") not in idx
    # Friday Jan 5 at 22:00 UTC — closed (NY close).
    assert pd.Timestamp("2024-01-05 22:00") not in idx
    # Friday Jan 5 at 21:00 UTC — last open hour of the week.
    assert pd.Timestamp("2024-01-05 21:00") in idx
    # Weekday at 12:00 UTC — open.
    assert pd.Timestamp("2024-01-03 12:00") in idx


def test_target_index_floors_messy_start_for_crypto_fx():
    """Regression: when called with a start that has minute/second/microsecond
    components (e.g. datetime.utcnow()), the crypto/FX hourly grid must still
    align with whole-hour source stamps, and the crypto/FX daily grid must
    still align with midnight-UTC source stamps. Otherwise reindex drops
    every source row.
    """
    messy_start = datetime(2024, 1, 1, 10, 40, 31, 399854)
    messy_end = datetime(2024, 1, 8, 10, 40, 31, 399854)

    # Crypto hourly — must be at whole hours, not :40:31.4
    idx = OHLCVCleaner(calendar="24x7", timeframe="1h")._target_index(messy_start, messy_end)
    assert (idx.minute == 0).all() and (idx.second == 0).all()
    assert pd.Timestamp("2024-01-02 12:00") in idx

    # Crypto daily — must be at midnight, not :40:31.4
    idx2 = OHLCVCleaner(calendar="24x7", timeframe="1d")._target_index(messy_start, messy_end)
    assert (idx2.hour == 0).all() and (idx2.minute == 0).all()
    assert pd.Timestamp("2024-01-06") in idx2

    # FX hourly — must align with whole hours after dropping the closed window
    idx3 = OHLCVCleaner(calendar="24x5", timeframe="1h")._target_index(messy_start, messy_end)
    assert (idx3.minute == 0).all() and (idx3.second == 0).all()


def test_unsupported_combination_raises():
    c = OHLCVCleaner(calendar="nyse", timeframe="1h")
    c.timeframe = "5m"  # type: ignore[assignment]
    with pytest.raises(ValueError, match="Unsupported"):
        c._target_index(WEEK_START, WEEK_END)


# ---------------------------------------------------------------------------
# _bounded_ffill — short gaps fill, long gaps survive
# ---------------------------------------------------------------------------
def _bars_with_gap(gap_len: int, gap_position: int = 5) -> pd.DataFrame:
    n = 20
    df = pd.DataFrame(
        {
            "open":   np.arange(1.0, n + 1.0),
            "high":   np.arange(1.0, n + 1.0) + 0.5,
            "low":    np.arange(1.0, n + 1.0) - 0.5,
            "close":  np.arange(1.0, n + 1.0),
            "volume": np.full(n, 1000.0),
        },
        index=pd.date_range("2024-01-01", periods=n, freq="D", name="ts"),
    )
    df.iloc[gap_position : gap_position + gap_len, :4] = np.nan
    df.iloc[gap_position : gap_position + gap_len, 4] = np.nan
    return df


def test_bounded_ffill_fills_short_gap():
    df = _bars_with_gap(gap_len=1)
    out, filled = OHLCVCleaner._bounded_ffill(df, max_gap=2)
    assert filled == 1
    # The filled row carries the prior close.
    assert out["close"].iloc[5] == out["close"].iloc[4]
    # Volume is zero on filled rows (no traded volume).
    assert out["volume"].iloc[5] == 0.0


def test_bounded_ffill_leaves_long_gap_alone():
    df = _bars_with_gap(gap_len=5)
    out, filled = OHLCVCleaner._bounded_ffill(df, max_gap=2)
    assert filled == 0
    # Long gap survives as NaN — the cleaner's final dropna catches it.
    assert out["close"].iloc[5:10].isna().all()
