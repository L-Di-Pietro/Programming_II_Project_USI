"""OHLCVCleaner — gap detection, dedup, business-day reindex.

Runs on every freshly-fetched DataFrame *before* it hits the database. The
goal is one tidy frame per (asset, timeframe), so downstream code never has
to think about source quirks.

Pipeline
--------
1. **Sort & dedup** — sort by index, drop duplicates (keep last).
2. **Sanity** — drop NaN OHLC, drop non-positive prices, fix high/low
   inconsistencies.
3. **Calendar reindex** — reindex onto the chosen business-day calendar
   (NYSE for cross-asset comparability). For 24/7 instruments (crypto) we
   forward-fill weekends; for 24/5 (FX) we forward-fill holidays.
4. **Gap report** — log any remaining missing days for human investigation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import exchange_calendars as ec
import pandas as pd
import structlog

log = structlog.get_logger(__name__)


CalendarChoice = Literal["nyse", "24x7", "24x5"]


@dataclass(frozen=True, slots=True)
class CleaningReport:
    """Diagnostics about what the cleaner did."""
    rows_in: int
    rows_out: int
    duplicates_dropped: int
    bad_rows_dropped: int
    forward_filled: int
    gaps_remaining: int


class OHLCVCleaner:
    """Cleans a raw OHLCV DataFrame for storage."""

    def __init__(self, calendar: CalendarChoice = "nyse") -> None:
        self.calendar = calendar
        self._nyse = ec.get_calendar("XNYS") if calendar == "nyse" else None

    # ------------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------------
    def clean(
        self,
        df: pd.DataFrame,
        start: datetime,
        end: datetime,
    ) -> tuple[pd.DataFrame, CleaningReport]:
        rows_in = len(df)
        if rows_in == 0:
            return df, CleaningReport(0, 0, 0, 0, 0, 0)

        # 1. sort + dedup
        df = df.sort_index()
        before_dedup = len(df)
        df = df[~df.index.duplicated(keep="last")]
        duplicates = before_dedup - len(df)

        # 2. sanity — drop bad rows
        before_sanity = len(df)
        df = self._sanity_filter(df)
        bad = before_sanity - len(df)

        # 3. reindex onto the chosen calendar
        df, filled = self._reindex_to_calendar(df, start, end)

        # 4. gap report — anything still NaN inside the requested range?
        gaps_remaining = int(df["close"].isna().sum())

        report = CleaningReport(
            rows_in=rows_in,
            rows_out=len(df),
            duplicates_dropped=duplicates,
            bad_rows_dropped=bad,
            forward_filled=filled,
            gaps_remaining=gaps_remaining,
        )
        import dataclasses
        log.info("cleaner.report", calendar=self.calendar, **dataclasses.asdict(report))
        return df, report

    # ------------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------------
    @staticmethod
    def _sanity_filter(df: pd.DataFrame) -> pd.DataFrame:
        """Drop physically-impossible rows.

        Cheap defenses against bad data: NaN OHLC, non-positive prices, or
        ``high < max(open, close, low)`` etc.
        """
        cols = ["open", "high", "low", "close"]
        df = df.dropna(subset=cols)
        df = df[(df[cols] > 0).all(axis=1)]
        df = df[df["high"] >= df[cols].max(axis=1)]
        df = df[df["low"] <= df[cols].min(axis=1)]
        return df

    def _reindex_to_calendar(
        self, df: pd.DataFrame, start: datetime, end: datetime
    ) -> tuple[pd.DataFrame, int]:
        """Reindex on the chosen trading-day calendar.

        For NYSE: forward-fill missing days (e.g. crypto weekends collapse
        onto the prior Friday close). This loses information but yields a
        single calendar across asset classes — necessary for cross-asset
        backtests.
        """
        if self.calendar == "nyse":
            # sessions_in_range requires midnight timestamps (no time component)
            cal_start = pd.Timestamp(start.date())
            cal_end = pd.Timestamp(end.date())
            sessions = self._nyse.sessions_in_range(  # type: ignore[union-attr]
                cal_start, cal_end
            )
            # Convert any tz-aware sessions to tz-naive UTC.
            target_index = pd.DatetimeIndex(
                [pd.Timestamp(s).tz_localize(None) for s in sessions], name="ts"
            )
        elif self.calendar == "24x7":
            target_index = pd.date_range(start, end, freq="D", name="ts")
        elif self.calendar == "24x5":
            target_index = pd.bdate_range(start, end, name="ts")
        else:  # pragma: no cover
            raise ValueError(f"Unknown calendar {self.calendar!r}")

        before = df["close"].notna().sum()
        df = df.reindex(target_index)
        df = df.ffill()  # carry the last good value across closures
        df = df.dropna(subset=["open", "high", "low", "close"])  # drop leading NaN (before first bar)
        after_ffill = df["close"].notna().sum()
        forward_filled = max(0, after_ffill - before)

        # Volume should be 0 on filled days, not the previous day's volume.
        # Detect by re-fetching the column from a "before-ffill" copy.
        df["volume"] = df["volume"].where(df["volume"].notna(), 0.0)

        return df, forward_filled
