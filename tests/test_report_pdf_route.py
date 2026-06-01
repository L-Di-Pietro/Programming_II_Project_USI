"""Tests for POST /backtests/{id}/report.pdf (headless-Chromium PDF render).

The handler is exercised directly. The real browser render is monkeypatched so
the test never launches Chromium — we verify routing, the 404 path, and the
download filename/headers only.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException

from backend.api.routes.backtest import render_report_pdf
from backend.api.schemas import ReportPdfRequest
from backend.database.models import Asset, BacktestRun, RunStatus, Strategy
from backend.timeutils import utcnow


def _seed_run(db) -> int:
    asset = Asset(symbol="AAPL", asset_class="equity", name="Apple Inc.")
    strategy = Strategy(
        slug="sma-crossover",
        name="SMA Crossover",
        description="Trend-following moving-average crossover.",
    )
    db.add_all([asset, strategy])
    db.flush()
    run = BacktestRun(
        strategy_id=strategy.id,
        asset_id=asset.id,
        client_id="owner-1",
        start_date=datetime(2020, 1, 1),
        end_date=datetime(2024, 1, 1),
        params={},
        commission_bps=5.0,
        slippage_bps=2.0,
        initial_cash=10_000.0,
        status=RunStatus.COMPLETED,
        completed_at=utcnow(),
    )
    db.add(run)
    db.commit()
    return run.id


def test_render_report_pdf_404_when_run_missing(db):
    with pytest.raises(HTTPException) as exc:
        render_report_pdf(run_id=9999, payload=ReportPdfRequest(html="<html></html>"), db=db)
    assert exc.value.status_code == 404


def test_render_report_pdf_returns_pdf_with_spec_filename(db, monkeypatch):
    run_id = _seed_run(db)

    # Stub the browser render so no Chromium is launched.
    import backend.analytics.report_pdf_render as renderer

    monkeypatch.setattr(renderer, "render_html_to_pdf", lambda html: b"%PDF-1.7 fake")

    resp = render_report_pdf(
        run_id=run_id, payload=ReportPdfRequest(html="<html>report</html>"), db=db
    )

    assert resp.media_type == "application/pdf"
    assert resp.body == b"%PDF-1.7 fake"
    # {Strategy}_{Ticker}_{Start}_{End}_report.pdf — matches the HTML filename.
    assert (
        resp.headers["content-disposition"]
        == 'attachment; filename="SMA_Crossover_AAPL_2020-01-01_2024-01-01_report.pdf"'
    )
