"""Render a self-contained HTML backtest report to PDF via headless Chromium.

The frontend builds the exact report document (Plotly inlined) in 'pdf' mode and
POSTs it; we load it in Chromium and export ``page.pdf()`` so the PDF is
pixel-identical to the interactive report.

Uses Playwright's *sync* API: the calling route is a sync ``def`` so FastAPI runs
it in a worker thread, where a sync Playwright context is valid. Chromium is
launched with the sandbox disabled so it runs inside the unprivileged Railway
container.
"""

from __future__ import annotations

import structlog
from playwright.sync_api import sync_playwright

log = structlog.get_logger(__name__)

_RENDER_TIMEOUT_MS = 45_000


def render_html_to_pdf(html: str) -> bytes:
    """Return the report HTML rendered to a print-ready PDF (bytes)."""
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        try:
            page = browser.new_page(viewport={"width": 1100, "height": 1400})
            page.set_content(html, wait_until="load", timeout=_RENDER_TIMEOUT_MS)
            # The inlined runtime flips this flag once every Plotly figure has
            # finished drawing — wait for it so charts are fully rendered.
            page.wait_for_function(
                "window.__REPORT_READY__ === true", timeout=_RENDER_TIMEOUT_MS
            )
            page.emulate_media(media="print")  # activates the report's @media print CSS
            # A4 with comfortable margins; print-background keeps the report's colours.
            return page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"},
            )
        finally:
            browser.close()
