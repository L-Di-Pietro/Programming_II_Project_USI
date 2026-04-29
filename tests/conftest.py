"""pytest fixtures shared across the test suite.

* In-memory SQLite DB that is created fresh for each test (no fixture
  pollution between tests).
* Synthetic OHLCV bars suitable for strategy and engine tests.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.database.connection import Base


# -----------------------------------------------------------------------------
# DB fixtures
# -----------------------------------------------------------------------------
@pytest.fixture
def db() -> Session:
    """Fresh in-memory SQLite DB per test."""
    engine = create_engine("sqlite:///:memory:", future=True)
    # Importing models registers them on Base.metadata.
    from backend.database import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# -----------------------------------------------------------------------------
# Bar fixtures
# -----------------------------------------------------------------------------
@pytest.fixture
def trending_bars() -> pd.DataFrame:
    """500 bars of a noisy uptrend — makes trend-following strategies happy."""
    rng = np.random.default_rng(seed=42)
    n = 500
    drift = np.linspace(100.0, 200.0, n)
    noise = rng.normal(0.0, 1.0, size=n)
    close = drift + noise
    open_ = np.concatenate([[close[0]], close[:-1]])
    high = np.maximum(open_, close) + np.abs(rng.normal(0.0, 0.5, size=n))
    low = np.minimum(open_, close) - np.abs(rng.normal(0.0, 0.5, size=n))
    volume = rng.integers(1_000, 10_000, size=n).astype(float)

    index = pd.date_range("2020-01-01", periods=n, freq="B", name="ts")
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=index,
    )


@pytest.fixture
def flat_bars() -> pd.DataFrame:
    """Flat price series — every metric should reduce to a degenerate value."""
    n = 252
    index = pd.date_range("2020-01-01", periods=n, freq="B", name="ts")
    return pd.DataFrame(
        {
            "open": np.full(n, 100.0),
            "high": np.full(n, 100.0),
            "low": np.full(n, 100.0),
            "close": np.full(n, 100.0),
            "volume": np.full(n, 1_000.0),
        },
        index=index,
    )


@pytest.fixture
def known_equity_curve() -> pd.Series:
    """A handcrafted equity curve where Sharpe / CAGR / MaxDD are computable
    by hand. Used to validate the metrics formulas."""
    # Two years of weekly equity moves, +1% each week with a single -10% drop.
    weeks = 104
    base = pd.Series(
        [100.0 * (1.01 ** i) for i in range(weeks)],
        index=pd.date_range("2020-01-03", periods=weeks, freq="W-FRI", name="ts"),
    )
    # Insert a drawdown halfway.
    drawdown_idx = base.index[weeks // 2]
    base.loc[drawdown_idx] *= 0.9
    return base
