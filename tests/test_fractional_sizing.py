"""Crypto/FX backtests size positions in fractional units; equities use whole shares."""

from __future__ import annotations

from backend.agents.backtest_agent import _allows_fractional
from backend.database.models import AssetClass


def test_crypto_and_fx_allow_fractional():
    assert _allows_fractional(AssetClass.CRYPTO)
    assert _allows_fractional(AssetClass.FX)


def test_equity_and_etf_use_whole_units():
    assert not _allows_fractional(AssetClass.EQUITY)
    assert not _allows_fractional(AssetClass.ETF)


def test_accepts_plain_string_asset_class():
    # asset.asset_class is a plain String column at runtime, not the enum.
    assert _allows_fractional("crypto")
    assert not _allows_fractional("equity")
