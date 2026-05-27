"""Render an LLM backtest report to a styled PDF via ReportLab."""

from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_INK = colors.HexColor("#1f2937")
_MUTED = colors.HexColor("#6b7280")
_ACCENT = colors.HexColor("#0891b2")
_BORDER = colors.HexColor("#d1d5db")
_PANEL = colors.HexColor("#f3f4f6")

_DISCLAIMER = (
    "AI analysis is not financial advice. "
    "Past performance does not guarantee future results."
)
_MARGIN = 20 * mm


def build_report_pdf(
    *,
    strategy_name: str,
    asset_symbol: str,
    timeframe: str,
    start_date: datetime,
    end_date: datetime,
    metrics: dict[str, Any],
    report_text: str,
    model: str,
    generated_at: datetime | None,
    demo_mode: bool,
) -> bytes:
    """Return a styled PDF (title, metrics summary, AI analysis, footer) as bytes."""
    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=_MARGIN,
        rightMargin=_MARGIN,
        topMargin=_MARGIN,
        bottomMargin=_MARGIN + 8 * mm,
        title=f"Backtest Report — {strategy_name} on {asset_symbol}",
    )

    flow: list[Any] = [
        Paragraph("Backtest Report", st["title"]),
        Paragraph(
            f"{strategy_name} &nbsp;·&nbsp; {asset_symbol} &nbsp;·&nbsp; "
            f"{start_date:%Y-%m-%d} → {end_date:%Y-%m-%d} &nbsp;·&nbsp; "
            f"{'Hourly' if timeframe == '1h' else 'Daily'}",
            st["subtitle"],
        ),
        Paragraph(
            f"Model: {model}{'  (demo mode)' if demo_mode else ''} &nbsp;·&nbsp; "
            f"Generated: {(generated_at or datetime.utcnow()):%Y-%m-%d %H:%M} UTC",
            st["meta"],
        ),
        Spacer(1, 10),
        Paragraph("Performance Summary", st["section"]),
        _metrics_table(metrics),
        Spacer(1, 6),
        Paragraph("AI Analysis", st["section"]),
        *_markdown_flowables(report_text, st),
    ]

    doc.build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def pdf_filename(strategy_name: str, asset_symbol: str, when: datetime | None) -> str:
    """Build a sanitized download filename: QuantBacktest_<strategy>_<asset>_<date>.pdf."""
    def slug(s: str) -> str:
        return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_") or "x"

    date = (when or datetime.utcnow()).strftime("%Y-%m-%d")
    return f"QuantBacktest_{slug(strategy_name)}_{slug(asset_symbol)}_{date}.pdf"


# -----------------------------------------------------------------------------
# Internals
# -----------------------------------------------------------------------------
def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body", parent=base["BodyText"], fontName="Helvetica",
        fontSize=10, leading=15, textColor=_INK, spaceAfter=6,
    )
    return {
        "title": ParagraphStyle(
            "RTitle", parent=body, fontName="Helvetica-Bold",
            fontSize=22, textColor=_ACCENT, spaceAfter=4,
        ),
        "subtitle": ParagraphStyle("RSub", parent=body, textColor=_MUTED, spaceAfter=2),
        "meta": ParagraphStyle("RMeta", parent=body, textColor=_MUTED, fontSize=9),
        "section": ParagraphStyle(
            "RSection", parent=body, fontName="Helvetica-Bold",
            fontSize=13, textColor=_INK, spaceBefore=14, spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "RH1", parent=body, fontName="Helvetica-Bold",
            fontSize=13, textColor=_INK, spaceBefore=12, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "RH2", parent=body, fontName="Helvetica-Bold",
            fontSize=11.5, textColor=_INK, spaceBefore=10, spaceAfter=3,
        ),
        "h3": ParagraphStyle(
            "RH3", parent=body, fontName="Helvetica-Bold",
            fontSize=10.5, textColor=_INK, spaceBefore=8, spaceAfter=2,
        ),
        "body": body,
    }


def _metrics_table(metrics: dict[str, Any]) -> Table:
    ret = metrics.get("return", {}) or {}
    risk = metrics.get("risk", {}) or {}
    trade = metrics.get("trade", {}) or {}

    def cell(group: dict[str, Any], key: str, *, pct: bool = False,
             signed: bool = False, ratio: bool = False) -> str:
        v = group.get(key)
        if v is None:
            return "—"
        if pct:
            return f"{v:+.2f}%" if signed else f"{v:.2f}%"
        if ratio:
            return f"{v:.2f}"
        return f"{int(v)}"

    rows = [
        ["CAGR", cell(ret, "cagr_pct", pct=True, signed=True),
         "Sharpe Ratio", cell(risk, "sharpe_ratio", ratio=True)],
        ["Total Return", cell(ret, "total_return_pct", pct=True, signed=True),
         "Sortino Ratio", cell(risk, "sortino_ratio", ratio=True)],
        ["Max Drawdown", cell(risk, "max_drawdown_pct", pct=True),
         "Calmar Ratio", cell(risk, "calmar_ratio", ratio=True)],
        ["Win Rate", cell(trade, "win_rate_pct", pct=True),
         "Profit Factor", cell(trade, "profit_factor", ratio=True)],
        ["Total Trades", cell(trade, "total_trades"),
         "Avg Win/Loss", cell(trade, "avg_win_loss", ratio=True)],
    ]

    table = Table(rows, colWidths=[34 * mm, 42.5 * mm, 34 * mm, 42.5 * mm])
    table.setStyle(
        TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5),
            ("TEXTCOLOR", (0, 0), (0, -1), _MUTED),
            ("TEXTCOLOR", (2, 0), (2, -1), _MUTED),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (1, 0), (1, -1), _INK),
            ("TEXTCOLOR", (3, 0), (3, -1), _INK),
            ("BACKGROUND", (0, 0), (0, -1), _PANEL),
            ("BACKGROUND", (2, 0), (2, -1), _PANEL),
            ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    return table


def _inline(text: str) -> str:
    """Escape XML, then re-introduce ReportLab markup for **bold** / *italic* / `code`."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", text)
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<i>\1</i>", text)
    return text


def _markdown_flowables(md: str, st: dict[str, ParagraphStyle]) -> list[Any]:
    """Minimal markdown → flowables: #/##/### headings, -/* bullets, paragraphs."""
    flow: list[Any] = []
    bullets: list[str] = []

    def flush() -> None:
        if bullets:
            flow.append(
                ListFlowable(
                    [ListItem(Paragraph(b, st["body"])) for b in bullets],
                    bulletType="bullet",
                    bulletColor=_ACCENT,
                    leftIndent=14,
                )
            )
            bullets.clear()

    for raw in md.replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        bullet = re.match(r"^[-*]\s+(.*)$", line)
        if heading:
            flush()
            style = {1: "h1", 2: "h2", 3: "h3"}[len(heading.group(1))]
            flow.append(Paragraph(_inline(heading.group(2)), st[style]))
        elif bullet:
            bullets.append(_inline(bullet.group(1)))
        else:
            flush()
            flow.append(Paragraph(_inline(line), st["body"]))
    flush()
    return flow


def _footer(canvas: Any, doc: Any) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica-Oblique", 7.5)
    canvas.setFillColor(_MUTED)
    canvas.drawString(_MARGIN, 12 * mm, _DISCLAIMER)
    canvas.drawRightString(A4[0] - _MARGIN, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()
