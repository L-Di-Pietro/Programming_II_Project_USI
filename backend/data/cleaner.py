"""OHLCVCleaner — gap detection, dedup, native-calendar reindex.

Runs on every freshly-fetched DataFrame *before* it hits the database. The
goal is one tidy frame per (asset, timeframe), so downstream code never has
to think about source quirks.

Pipeline
--------
1. **Sort & dedup** — sort by index, drop duplicates (keep last).
2. **Sanity** — drop NaN OHLC, drop non-positive prices, fix high/low
   inconsistencies.
3. **Calendar reindex** — reindex onto the asset's *native* calendar:
   NYSE (XNYS) for equities/ETF, 24×5 for FX (Sun 22:00 UTC → Fri 22:00
   UTC interbank window), 24×7 for crypto. Both daily and hourly grids
   are supported.
4. **Bounded ffill** — only NaN runs of length ≤ 2 are forward-filled
   (volume=0 on filled rows). Longer outages survive as NaN and surface
   via ``CleaningReport.gaps_remaining`` for human investigation.
5. **Gap report** — log any remaining missing bars inside the range.

See ``docs/calendars.md`` for the formal calendar definitions.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import exchange_calendars as ec
import numpy as np
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
    """Cleans a raw OHLCV DataFrame for storage.

    Parameters
    ----------
    calendar : {"nyse", "24x7", "24x5"}
        Trading calendar to reindex onto. Pick per asset class:
        NYSE for equities/ETF, 24x5 for FX, 24x7 for crypto.
    timeframe : {"1d", "1h"}
        Bar resolution. Determines whether the target index is daily
        sessions or an hourly grid inside each session / window.
    """

    def __init__(
        self,
        calendar: CalendarChoice = "nyse",
        timeframe: str = "1d",
    ) -> None:
        self.calendar: CalendarChoice = calendar
        # Accepted as str for ergonomic call sites; _target_index raises on
        # unknown combinations. Allowed: "1d", "1h".
        self.timeframe: str = timeframe
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
        gaps_remaining = int(df["close"].isna().sum()) if not df.empty else 0

        report = CleaningReport(
            rows_in=rows_in,
            rows_out=len(df),
            duplicates_dropped=duplicates,
            bad_rows_dropped=bad,
            forward_filled=filled,
            gaps_remaining=gaps_remaining,
        )
        import dataclasses
        log.info(
            "cleaner.report",
            calendar=self.calendar,
            timeframe=self.timeframe,
            **dataclasses.asdict(report),
        )
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
        """Reindex onto the asset's native (calendar, timeframe) grid.

        Bounded ffill (≤ 2 consecutive bars) handles rare single-bar
        outages from data sources; longer gaps survive as NaN and are
        dropped, then surfaced in ``gaps_remaining``.
        """
        target_index = self._target_index(start, end)

        before = df["close"].notna().sum()
        df = df.reindex(target_index)
        df, filled_count = self._bounded_ffill(df, max_gap=2)
        df = df.dropna(subset=["open", "high", "low", "close"])
        after = df["close"].notna().sum()
        forward_filled = max(0, int(filled_count if filled_count else after - before))

        return df, forward_filled

    # ------------------------------------------------------------------------
    # Target-index builders (one per (calendar, timeframe) pair)
    # ------------------------------------------------------------------------
    def _target_index(self, start: datetime, end: datetime) -> pd.DatetimeIndex:
        """Dispatch to the right builder. Returns tz-naive UTC index."""
        if self.calendar == "nyse":
            if self.timeframe == "1d":
                return self._nyse_daily_index(start, end)
            if self.timeframe == "1h":
                return self._nyse_hourly_index(start, end)
        elif self.calendar == "24x7":
            if self.timeframe == "1d":
                return self._crypto_daily_index(start, end)
            if self.timeframe == "1h":
                return self._crypto_hourly_index(start, end)
        elif self.calendar == "24x5":
            if self.timeframe == "1d":
                return self._fx_daily_index(start, end)
            if self.timeframe == "1h":
                return self._fx_hourly_index(start, end)
        raise ValueError(
            f"Unsupported (calendar, timeframe): "
            f"({self.calendar!r}, {self.timeframe!r})"
        )

    def _nyse_daily_index(self, start: datetime, end: datetime) -> pd.DatetimeIndex:
        cal_start = pd.Timestamp(start.date())
        cal_end = pd.Timestamp(end.date())
        sessions = self._nyse.sessions_in_range(cal_start, cal_end)  # type: ignore[union-attr]
        return pd.DatetimeIndex(
            [pd.Timestamp(s).tz_localize(None) for s in sessions], name="ts"
        )

    def _nyse_hourly_index(self, start: datetime, end: datetime) -> pd.DatetimeIndex:
        """Hourly stamps inside each NYSE session.

        Slices ``self._nyse.schedule`` (a pre-computed DataFrame with
        tz-aware UTC ``open`` and ``close`` columns) to the requested
        range. For each session, builds
        ``date_range(open, close, freq='1h', inclusive='left')`` — a
        regular 09:30–16:00 ET session yields 7 stamps at half-past hours
        (14:30 .. 20:30 UTC); early-close sessions yield fewer.
        """
        cal_start = pd.Timestamp(start.date())
        cal_end = pd.Timestamp(end.date())
        sched = self._nyse.schedule.loc[cal_start:cal_end]  # type: ignore[union-attr]
        if sched.empty:
            return pd.DatetimeIndex([], name="ts")

        # exchange_calendars uses different column names across versions.
        open_col = "open" if "open" in sched.columns else "market_open"
        close_col = "close" if "close" in sched.columns else "market_close"

        pieces: list[pd.DatetimeIndex] = []
        for open_ts, close_ts in zip(sched[open_col], sched[close_col], strict=True):
            piece = pd.date_range(
                start=pd.Timestamp(open_ts),
                end=pd.Timestamp(close_ts),
                freq="1h",
                inclusive="left",
            )
            pieces.append(piece)
        if not pieces:
            return pd.DatetimeIndex([], name="ts")
        combined = pieces[0].append(pieces[1:]) if len(pieces) > 1 else pieces[0]
        if combined.tz is not None:
            combined = combined.tz_convert("UTC").tz_localize(None)
        return pd.DatetimeIndex(combined, name="ts")

    @staticmethod
    def _crypto_daily_index(start: datetime, end: datetime) -> pd.DatetimeIndex:
        return pd.date_range(start, end, freq="D", name="ts")

    @staticmethod
    def _crypto_hourly_index(start: datetime, end: datetime) -> pd.DatetimeIndex:
        return pd.date_range(start, end, freq="h", name="ts")

    @staticmethod
    def _fx_daily_index(start: datetime, end: datetime) -> pd.DatetimeIndex:
        return pd.bdate_range(start, end, name="ts")

    @staticmethod
    def _fx_hourly_index(start: datetime, end: datetime) -> pd.DatetimeIndex:
        """Hourly grid minus the FX weekend closure.

        Interbank FX trades from Sunday 22:00 UTC (Sydney open) through
        Friday 22:00 UTC (NY close). Closed window in UTC terms:
        ``Fri 22:00 ≤ ts < Sun 22:00``.
        """
        idx = pd.date_range(start, end, freq="h", name="ts")
        if len(idx) == 0:
            return idx
        dow = idx.dayofweek
        hr = idx.hour
        closed = ((dow == 4) & (hr >= 22)) | (dow == 5) | ((dow == 6) & (hr < 22))
        return idx[~closed]

    # ------------------------------------------------------------------------
    # Bounded ffill
    # ------------------------------------------------------------------------
    @staticmethod
    def _bounded_ffill(
        df: pd.DataFrame, max_gap: int = 2
    ) -> tuple[pd.DataFrame, int]:
        """Forward-fill only NaN runs of length ≤ ``max_gap``.

        Volume on filled rows is set to 0 (filled bars carry no traded
        volume — the price is a carryover, not a real print). Longer NaN
        runs are left untouched and surface in ``gaps_remaining``.

        Returns ``(filled_df, rows_filled)``.
        """
        if df.empty:
            return df, 0

        close = df["close"]
        nan_mask = close.isna().to_numpy()
        if not nan_mask.any():
            return df, 0

        # Identify contiguous NaN runs. Each run is a (start, length) pair.
        fill_targets = np.zeros(len(df), dtype=bool)
        i = 0
        n = len(nan_mask)
        while i < n:
            if nan_mask[i]:
                j = i
                while j < n and nan_mask[j]:
                    j += 1
                run_len = j - i
                # Only fill runs of length ≤ max_gap AND that have a
                # non-NaN bar preceding them (otherwise there's nothing
                # to carry from).
                if run_len <= max_gap and i > 0 and not nan_mask[i - 1]:
                    fill_targets[i:j] = True
                i = j
            else:
                i += 1

        if not fill_targets.any():
            return df, 0

        df = df.copy()
        price_cols = ["open", "high", "low", "close"]
        # Forward-fill across all rows, then keep only the rows we marked.
        filled_full = df[price_cols].ffill()
        df.loc[fill_targets, price_cols] = filled_full.loc[fill_targets, price_cols].to_numpy()
        # Volume on filled rows is 0 (no traded volume on a carried bar).
        df.loc[fill_targets, "volume"] = 0.0
        return df, int(fill_targets.sum())
