"""Verify that DataAgent picks the right calendar per asset class.

Today the cleaner was hardcoded to "nyse" for every asset; this test
guards the new dispatch: EQUITY/ETF → nyse, FX → 24x5, CRYPTO → 24x7.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock

import pandas as pd
import pytest

from backend.agents import data_agent as data_agent_module
from backend.agents.data_agent import DataAgent, DataAgentInput
from backend.database.models import Asset, AssetClass


@pytest.mark.parametrize(
    "asset_class,expected_calendar",
    [
        (AssetClass.EQUITY, "nyse"),
        (AssetClass.ETF, "nyse"),
        (AssetClass.FX, "24x5"),
        (AssetClass.CRYPTO, "24x7"),
    ],
)
def test_calendar_dispatch_per_asset_class(
    asset_class, expected_calendar, db, monkeypatch
):
    db.add(
        Asset(
            symbol=f"TEST-{asset_class}",
            asset_class=asset_class,
            name="Test Asset",
            exchange="TEST",
            currency="USD",
            is_active=True,
            created_at=datetime(2024, 1, 1),
        )
    )
    db.commit()

    # Fake fetcher returns one valid bar so the cleaner has something to clean.
    one_bar = pd.DataFrame(
        {"open": [1.0], "high": [1.0], "low": [1.0], "close": [1.0], "volume": [0.0]},
        index=pd.DatetimeIndex([datetime(2024, 1, 2)], name="ts"),
    )
    fake_fetcher = MagicMock()
    fake_fetcher.fetch.return_value = one_bar
    fake_fetcher.source_name = "test"
    fake_fetcher_cls = MagicMock(return_value=fake_fetcher)

    monkeypatch.setitem(DataAgent._FETCHERS, asset_class, fake_fetcher_cls)

    # Spy on OHLCVCleaner to capture the calendar+timeframe it was built with.
    captured: dict[str, str] = {}
    real_cleaner_cls = data_agent_module.OHLCVCleaner

    def spy_cleaner(calendar, timeframe):
        captured["calendar"] = calendar
        captured["timeframe"] = timeframe
        return real_cleaner_cls(calendar=calendar, timeframe=timeframe)

    monkeypatch.setattr(data_agent_module, "OHLCVCleaner", spy_cleaner)

    DataAgent(db).run(
        DataAgentInput(
            op="refresh",
            symbol=f"TEST-{asset_class}",
            start=datetime(2024, 1, 1),
            end=datetime(2024, 1, 3),
            timeframe="1d",
        )
    )

    assert captured["calendar"] == expected_calendar
    assert captured["timeframe"] == "1d"
    # Fetcher was called with the requested timeframe.
    fake_fetcher.fetch.assert_called_once()
    assert fake_fetcher.fetch.call_args.kwargs["timeframe"] == "1d"


def test_calendar_dispatch_passes_hourly_timeframe(db, monkeypatch):
    db.add(
        Asset(
            symbol="TEST-HRLY",
            asset_class=AssetClass.CRYPTO,
            name="Test Crypto",
            exchange="TEST",
            currency="USD",
            is_active=True,
            created_at=datetime(2024, 1, 1),
        )
    )
    db.commit()

    one_bar = pd.DataFrame(
        {"open": [1.0], "high": [1.0], "low": [1.0], "close": [1.0], "volume": [0.0]},
        index=pd.DatetimeIndex([datetime(2024, 6, 1, 12, 0)], name="ts"),
    )
    fake_fetcher = MagicMock()
    fake_fetcher.fetch.return_value = one_bar
    fake_fetcher.source_name = "test"
    monkeypatch.setitem(
        DataAgent._FETCHERS, AssetClass.CRYPTO, MagicMock(return_value=fake_fetcher)
    )

    captured: dict[str, str] = {}
    real_cleaner_cls = data_agent_module.OHLCVCleaner
    monkeypatch.setattr(
        data_agent_module,
        "OHLCVCleaner",
        lambda calendar, timeframe: captured.update({"calendar": calendar, "timeframe": timeframe}) or real_cleaner_cls(calendar=calendar, timeframe=timeframe),
    )

    DataAgent(db).run(
        DataAgentInput(
            op="refresh",
            symbol="TEST-HRLY",
            start=datetime(2024, 6, 1),
            end=datetime(2024, 6, 2),
            timeframe="1h",
        )
    )

    assert captured["calendar"] == "24x7"
    assert captured["timeframe"] == "1h"
    assert fake_fetcher.fetch.call_args.kwargs["timeframe"] == "1h"
