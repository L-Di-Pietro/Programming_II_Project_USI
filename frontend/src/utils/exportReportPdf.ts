import jsPDF from "jspdf";
import Plotly from "plotly.js-dist-min";

import {
  Api,
  type BenchmarkKind,
  type EquityPoint,
  type Metrics,
  type Report,
  type Trade,
} from "@/api/client";
import { formatLocal } from "@/utils/datetime";

const PAGE_W = 595.28;   // A4 portrait, in pt
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_RESERVE = 36;

const COLOR_INK = "#1f2937";
const COLOR_MUTED = "#6b7280";
const COLOR_ACCENT = "#0891b2";

// Benchmark line colours for the equity overlay. Solid lines; the strategy line
// (cyan #22d3ee) already comes from the server figure. Buy & Hold uses blue
// rather than the app's amber, and S&P 500 keeps the app's violet-pink — so the
// trio reads as cyan / blue / pink, per request.
const PDF_BENCHMARKS: { kind: BenchmarkKind; label: string; color: string }[] = [
  { kind: "buy_and_hold", label: "Buy & Hold", color: "#60a5fa" },
  { kind: "sp500", label: "S&P 500", color: "#c084fc" },
];

const CHART_W = 1000;
const CHART_H = 520;

export async function exportReportPdf(runId: number, report: Report): Promise<void> {
  const [
    run,
    assets,
    metrics,
    trades,
    equityFig,
    drawdownFig,
    heatmapFig,
    rollingFig,
    benchEquitySettled,
    benchMetricsSettled,
  ] = await Promise.all([
    Api.getBacktest(runId),
    Api.listAssets(),
    Api.getMetrics(runId),
    Api.getTrades(runId),
    Api.getChart(runId, "equity"),
    Api.getChart(runId, "drawdown"),
    Api.getChart(runId, "heatmap"),
    Api.getChart(runId, "rolling_sharpe"),
    // Benchmarks may not exist for every run (e.g. a run already on SPY has no
    // S&P 500 curve) — tolerate per-kind failures so the export still succeeds.
    Promise.allSettled([
      Api.getBenchmarkEquity(runId, "buy_and_hold"),
      Api.getBenchmarkEquity(runId, "sp500"),
    ]),
    Promise.allSettled([
      Api.getBenchmarkMetrics(runId, "buy_and_hold"),
      Api.getBenchmarkMetrics(runId, "sp500"),
    ]),
  ]);

  const asset = assets.find((a) => a.id === run.asset_id);

  // Which benchmarks actually have data, in PDF_BENCHMARKS order.
  const benchEquities: { kind: BenchmarkKind; label: string; color: string; equity: EquityPoint[] }[] = [];
  const benchMetrics: Partial<Record<BenchmarkKind, Metrics>> = {};
  PDF_BENCHMARKS.forEach((b, i) => {
    const eq = benchEquitySettled[i];
    if (eq.status === "fulfilled" && eq.value.length > 0) {
      benchEquities.push({ ...b, equity: eq.value });
    }
    const mt = benchMetricsSettled[i];
    if (mt.status === "fulfilled") benchMetrics[b.kind] = mt.value;
  });

  // Build the figures we customise; keep the rest as the server returned them.
  const chartFigures: { label: string; data: Plotly.Data[]; layout: Partial<Plotly.Layout> }[] = [
    { label: "Equity Curve", ...buildEquityFigure(equityFig.figure, benchEquities) },
    {
      label: "Drawdown",
      data: drawdownFig.figure.data as Plotly.Data[],
      layout: drawdownFig.figure.layout as Partial<Plotly.Layout>,
    },
    {
      label: "Monthly Returns",
      data: heatmapFig.figure.data as Plotly.Data[],
      layout: heatmapFig.figure.layout as Partial<Plotly.Layout>,
    },
    { label: "Trade P&L", ...buildTradePnlFigure(trades) },
    {
      label: "Rolling Sharpe",
      data: rollingFig.figure.data as Plotly.Data[],
      layout: rollingFig.figure.layout as Partial<Plotly.Layout>,
    },
  ];

  const images = await Promise.all(
    chartFigures.map((f) =>
      Plotly.toImage(
        { data: f.data, layout: f.layout },
        { format: "png", width: CHART_W, height: CHART_H, scale: 2 },
      ),
    ),
  );

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  y = drawCover(doc, y, {
    runId,
    asset: asset?.symbol ?? `asset #${run.asset_id}`,
    assetName: asset?.name,
    startDate: run.start_date,
    endDate: run.end_date,
    timeframe: run.timeframe,
    model: report.model,
    generatedAt: report.generated_at,
    demoMode: report.demo_mode,
  });

  y = drawHeading(doc, y, "Performance Summary", 14);
  y = drawMetricsTable(doc, y, metrics);

  y = drawComparison(doc, y, metrics, benchMetrics);

  chartFigures.forEach((c, i) => {
    y = drawChart(doc, y, c.label, images[i]);
  });

  y = ensureSpace(doc, y, 40);
  y = drawHeading(doc, y, "AI Analysis", 16);
  y = drawMarkdown(doc, y, report.text);

  drawDisclaimerFooterOnAllPages(doc);

  doc.save(`backtest-run-${runId}.pdf`);
}

// -----------------------------------------------------------------------------
// Figure builders (match the on-screen charts; light background to blend in)
// -----------------------------------------------------------------------------

/** Server equity figure (strategy only) + solid benchmark overlays, legend on top. */
function buildEquityFigure(
  fig: { data: unknown[]; layout: Record<string, unknown> },
  benchmarks: { kind: BenchmarkKind; label: string; color: string; equity: EquityPoint[] }[],
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const data: Plotly.Data[] = [...(fig.data as Plotly.Data[])];
  for (const b of benchmarks) {
    data.push({
      type: "scatter",
      mode: "lines",
      x: b.equity.map((p) => p.ts),
      y: b.equity.map((p) => p.equity),
      name: b.label,
      line: { color: b.color, width: 1.5 },
    } as Plotly.Data);
  }
  const layout: Partial<Plotly.Layout> = {
    ...(fig.layout as Partial<Plotly.Layout>),
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    showlegend: true,
    legend: { orientation: "h", x: 0, y: 1.12, xanchor: "left", yanchor: "bottom" },
    margin: { t: 54, r: 16, b: 40, l: 60 },
  };
  return { data, layout };
}

/** Trade P&L as the on-screen green/red BAR chart (TradePnlChart.tsx), light themed. */
function buildTradePnlFigure(
  trades: Trade[],
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const wins = trades.map((t, i) => ({ i, v: t.net_pnl })).filter((x) => x.v > 0);
  const losses = trades.map((t, i) => ({ i, v: t.net_pnl })).filter((x) => x.v <= 0);

  const data: Plotly.Data[] = [
    {
      type: "bar",
      x: wins.map((x) => x.i),
      y: wins.map((x) => x.v),
      name: "Win",
      marker: { color: "#3fb950" },
    },
    {
      type: "bar",
      x: losses.map((x) => x.i),
      y: losses.map((x) => x.v),
      name: "Loss",
      marker: { color: "#f85149" },
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    paper_bgcolor: "white",
    plot_bgcolor: "white",
    showlegend: false,
    margin: { t: 16, r: 16, b: 40, l: 70 },
    yaxis: { tickprefix: "$" },
    shapes: [
      {
        type: "line",
        xref: "paper",
        yref: "y",
        x0: 0,
        x1: 1,
        y0: 0,
        y1: 0,
        line: { color: "#9ca3af", width: 1, dash: "dot" },
      },
    ],
  };

  return { data, layout };
}

// -----------------------------------------------------------------------------
// Metric formatting + tables
// -----------------------------------------------------------------------------

function fmtPct(v: number | undefined, signed: boolean): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(2);
  return signed && v >= 0 ? `+${s}%` : `${s}%`;
}

function fmtRatio(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtInt(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}`;
}

/** 5×2 KPI grid mirroring backend/analytics/report_pdf.py::_metrics_table. */
function drawMetricsTable(doc: jsPDF, y: number, m: Metrics): number {
  const ret = m["return"] ?? {};
  const risk = m.risk ?? {};
  const trade = m.trade ?? {};

  const rows: [string, string, string, string][] = [
    ["CAGR", fmtPct(ret.cagr_pct, true), "Sharpe Ratio", fmtRatio(risk.sharpe_ratio)],
    ["Total Return", fmtPct(ret.total_return_pct, true), "Sortino Ratio", fmtRatio(risk.sortino_ratio)],
    ["Max Drawdown", fmtPct(risk.max_drawdown_pct, false), "Calmar Ratio", fmtRatio(risk.calmar_ratio)],
    ["Win Rate", fmtPct(trade.win_rate_pct, false), "Profit Factor", fmtRatio(trade.profit_factor)],
    ["Total Trades", fmtInt(trade.total_trades), "Avg Win/Loss", fmtRatio(trade.win_loss_ratio)],
  ];

  const col2X = MARGIN + CONTENT_W / 2;
  const valueOffset = 96;
  doc.setFontSize(11);
  for (const [k1, v1, k2, v2] of rows) {
    y = ensureSpace(doc, y, 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLOR_MUTED);
    doc.text(k1, MARGIN, y + 11);
    doc.text(k2, col2X, y + 11);
    doc.setTextColor(COLOR_INK);
    doc.text(v1, MARGIN + valueOffset, y + 11);
    doc.text(v2, col2X + valueOffset, y + 11);
    y += 16;
  }
  return y + 8;
}

/** Compact Strategy-vs-Benchmarks table. Skipped when no benchmarks are available. */
function drawComparison(
  doc: jsPDF,
  y: number,
  strat: Metrics,
  benchMetrics: Partial<Record<BenchmarkKind, Metrics>>,
): number {
  const cols: { label: string; m: Metrics }[] = [{ label: "Strategy", m: strat }];
  for (const b of PDF_BENCHMARKS) {
    const bm = benchMetrics[b.kind];
    if (bm) cols.push({ label: b.label, m: bm });
  }
  if (cols.length < 2) return y; // nothing to compare against

  y = drawHeading(doc, y, "Strategy vs Benchmarks", 14);

  const metricRows: { label: string; get: (m: Metrics) => string }[] = [
    { label: "CAGR", get: (m) => fmtPct(m["return"]?.cagr_pct, true) },
    { label: "Total Return", get: (m) => fmtPct(m["return"]?.total_return_pct, true) },
    { label: "Max Drawdown", get: (m) => fmtPct(m.risk?.max_drawdown_pct, false) },
    { label: "Sharpe", get: (m) => fmtRatio(m.risk?.sharpe_ratio) },
  ];

  const labelW = 120;
  const colW = (CONTENT_W - labelW) / cols.length;

  // Header row — series names.
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_MUTED);
  cols.forEach((c, i) => doc.text(c.label, MARGIN + labelW + i * colW, y + 11));
  y += 18;

  doc.setFont("helvetica", "normal");
  for (const r of metricRows) {
    y = ensureSpace(doc, y, 16);
    doc.setTextColor(COLOR_MUTED);
    doc.text(r.label, MARGIN, y + 11);
    doc.setTextColor(COLOR_INK);
    cols.forEach((c, i) => doc.text(r.get(c.m), MARGIN + labelW + i * colW, y + 11));
    y += 16;
  }
  return y + 10;
}

// -----------------------------------------------------------------------------
// Drawing helpers
// -----------------------------------------------------------------------------

interface CoverData {
  runId: number;
  asset: string;
  assetName?: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  model: string;
  generatedAt: string;
  demoMode: boolean;
}

function drawCover(doc: jsPDF, y: number, c: CoverData): number {
  doc.setTextColor(COLOR_ACCENT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Backtest Report", MARGIN, y);
  y += 26;

  doc.setTextColor(COLOR_MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Run #${c.runId}`, MARGIN, y);
  y += 18;

  const rows: [string, string][] = [
    ["Asset",     c.assetName ? `${c.asset} — ${c.assetName}` : c.asset],
    ["Timeframe", c.timeframe === "1h" ? "Hourly" : "Daily"],
    ["Range",     `${c.startDate.slice(0, 10)} – ${c.endDate.slice(0, 10)}`],
    ["Model",     `${c.model}${c.demoMode ? "  (demo mode)" : ""}`],
    ["Generated", formatLocal(c.generatedAt)],
  ];

  doc.setFontSize(11);
  for (const [k, v] of rows) {
    doc.setTextColor(COLOR_MUTED);
    doc.text(k, MARGIN, y);
    doc.setTextColor(COLOR_INK);
    doc.text(v, MARGIN + 86, y);
    y += 16;
  }

  if (c.demoMode) {
    y += 4;
    doc.setTextColor("#b45309");
    doc.setFontSize(9);
    doc.text(
      "Demo mode: report was generated by the NullProvider (no real LLM call).",
      MARGIN,
      y,
    );
    y += 14;
  }

  return y + 12;
}

function drawChart(doc: jsPDF, y: number, label: string, pngDataUrl: string): number {
  const imgH = CONTENT_W * (CHART_H / CHART_W); // preserve 1000x520 aspect
  const blockH = 18 + 4 + imgH;
  y = ensureSpace(doc, y, blockH);

  doc.setTextColor(COLOR_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(label, MARGIN, y);
  y += 6;

  doc.addImage(pngDataUrl, "PNG", MARGIN, y, CONTENT_W, imgH);
  return y + imgH + 18;
}

function drawHeading(doc: jsPDF, y: number, text: string, size: number): number {
  y = ensureSpace(doc, y, size + 12);
  doc.setTextColor(COLOR_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.text(text, MARGIN, y + size * 0.8);
  return y + size + 10;
}

// Minimal markdown → jsPDF renderer. Handles # / ## / ### headings, blank-line
// paragraph breaks, and -/* bullet lists. Inline **bold** and *italics* markers
// are stripped (the report's hierarchy comes from headings, not emphasis).
function drawMarkdown(doc: jsPDF, y: number, md: string): number {
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line === "") {
      y += 6;
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);

    if (h1) {
      y = drawHeading(doc, y + 6, stripInline(h1[1]), 15);
      continue;
    }
    if (h2) {
      y = drawHeading(doc, y + 4, stripInline(h2[1]), 13);
      continue;
    }
    if (h3) {
      y = drawHeading(doc, y + 2, stripInline(h3[1]), 11);
      continue;
    }
    if (bullet) {
      y = drawBullet(doc, y, stripInline(bullet[1]));
      continue;
    }

    y = drawParagraph(doc, y, stripInline(line));
  }

  return y;
}

function drawParagraph(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(COLOR_INK);
  const wrapped = doc.splitTextToSize(text, CONTENT_W) as string[];
  for (const w of wrapped) {
    y = ensureSpace(doc, y, 14);
    doc.text(w, MARGIN, y + 10);
    y += 14;
  }
  return y + 2;
}

function drawBullet(doc: jsPDF, y: number, text: string): number {
  const indent = 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(COLOR_INK);
  const wrapped = doc.splitTextToSize(text, CONTENT_W - indent) as string[];
  for (let i = 0; i < wrapped.length; i++) {
    y = ensureSpace(doc, y, 14);
    if (i === 0) {
      doc.text("•", MARGIN + 2, y + 10);
    }
    doc.text(wrapped[i], MARGIN + indent, y + 10);
    y += 14;
  }
  return y + 2;
}

function stripInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN - FOOTER_RESERVE) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawDisclaimerFooterOnAllPages(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(COLOR_MUTED);
    doc.text(
      "AI analysis is not financial advice. Past performance does not guarantee future results.",
      MARGIN,
      PAGE_H - MARGIN + 6,
    );
    doc.text(`${i} / ${pages}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 6, { align: "right" });
  }
}
