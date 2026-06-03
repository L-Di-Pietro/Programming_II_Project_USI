// Self-contained, offline, interactive HTML report. One .html file with all CSS,
// fonts (base64), the full Plotly library, chart data, and a tiny toggle runtime
// inlined — opens in any browser with no network. Benchmark overlays render as
// per-chart toggle buttons whose state is global (toggling a benchmark updates
// every chart at once). Styled as a light, printed institutional research note.
//
// Sibling of exportReportPdf.ts (a standalone jsPDF generator, retained but no
// longer wired to a live button). This module powers the "Download" action in
// both the Dashboard runs table and the Results-page AI Analyst modal — same
// generator, same args, so both entry points emit an identical file.

import {
  Api,
  type Asset,
  type BacktestDetail,
  type BenchmarkKind,
  type EquityPoint,
  type Metrics,
  type Report,
  type Trade,
} from "@/api/client";
import { fmtBacktestDate, formatLocal } from "@/utils/datetime";
import { computeMonthlyReturns } from "@/utils/monthlyReturns";

// IBM Plex (OFL) as base64 data URIs (see assets/fonts/plex.ts) so the document
// is fully offline — identical in dev and prod, no reliance on Vite ?inline.
import { serif500, serif600, sans400, sans600, mono400, mono500 } from "@/assets/fonts/plex";

// -----------------------------------------------------------------------------
// Palette — light "paper" theme. The strategy/benchmark trio is the report's
// cyan/blue/pink convention (see exportReportPdf.ts), darkened for white bg.
// -----------------------------------------------------------------------------
const C = {
  page: "#e8e7e2",
  card: "#ffffff",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  hair: "#e7e8ec",
  rowalt: "#fafafb",
  strategy: "#0891b2",
  bh: "#2563eb",
  spx: "#9333ea",
  pos: "#15803d",
  neg: "#b91c1c",
  warn: "#b45309",
};

// -----------------------------------------------------------------------------
// Public payload types
// -----------------------------------------------------------------------------
export interface ReportBenchmark {
  kind: BenchmarkKind;
  label: string;
  color: string;
  equity: EquityPoint[];
  metrics: Metrics | null;
}

export interface ReportPayload {
  runId: number;
  run: BacktestDetail;
  asset?: Asset;
  metrics: Metrics;
  equity: EquityPoint[];
  trades: Trade[];
  benchmarks: ReportBenchmark[]; // only benchmarks that have data for this run
  report: Report;
}

// "interactive": the in-browser report (toggle buttons, Save/Print actions).
// "pdf": a static variant for the headless-Chromium PDF render — toggles become
// a non-interactive legend and the action buttons are dropped.
export type ReportMode = "interactive" | "pdf";

// Per-section include/exclude switches (used by the PDF export so a user can
// keep only the parts they want). Omitted or `true` = included; only an explicit
// `false` drops a section. The cover and footer are always present.
export interface ReportSections {
  summary?: boolean; // Executive Summary KPI cards
  metrics?: boolean; // Full Metrics table
  comparison?: boolean; // Strategy vs. Benchmarks
  equity?: boolean; // Equity Curve chart
  drawdown?: boolean; // Drawdown chart
  monthly?: boolean; // Monthly Returns heatmap
  trades?: boolean; // Trade P&L
  commentary?: boolean; // AI Analysis narrative
  params?: boolean; // Run Parameters appendix
}

// -----------------------------------------------------------------------------
// Formatting + colour semantics (mirrors MetricsPanel.tsx thresholds)
// -----------------------------------------------------------------------------
const pctSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const pctPlain = (v: number) => `${v.toFixed(2)}%`;
const ratio = (v: number) => v.toFixed(2);
const ratioX = (v: number) => `${v.toFixed(2)}×`;
const intFmt = (v: number) => `${Math.round(v)}`;
const daysFmt = (v: number) => `${Math.round(v)} days`;
const money = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type Colorer = (v: number) => string;
const signed: Colorer = (v) => (v >= 0 ? C.pos : C.neg);
const thresh = (lo: number, hi: number): Colorer => (v) =>
  v >= hi ? C.pos : v >= lo ? C.warn : C.neg;
const alwaysRed: Colorer = () => C.neg;
const alwaysGreen: Colorer = () => C.pos;
const neutral: Colorer = () => C.ink;

function valOf(m: Metrics | null | undefined, grp: keyof Metrics, key: string): number | null {
  const v = m?.[grp]?.[key];
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
}
function cellHtml(
  m: Metrics | null | undefined,
  grp: keyof Metrics,
  key: string,
  fmt: (v: number) => string,
  color: Colorer,
): { text: string; color: string } {
  const v = valOf(m, grp, key);
  if (v === null) return { text: "—", color: C.muted };
  return { text: fmt(v), color: color(v) };
}

// -----------------------------------------------------------------------------
// String helpers
// -----------------------------------------------------------------------------
function escapeHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
/** Safe JSON for embedding inside a <script> tag (neutralise </script> + line seps). */
function jsonEmbed(x: unknown): string {
  return JSON.stringify(x)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}
function prettyKey(k: string): string {
  return escapeHtml(k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
}
function fmtParamVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return escapeHtml(JSON.stringify(v));
  return escapeHtml(String(v));
}

/** Minimal, escaped markdown → HTML for the AI narrative (headings/bullets/inline). */
function mdToHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const head = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (head) {
      closeList();
      const tag = head[1].length <= 2 ? "h3" : "h4";
      out.push(`<${tag}>${inline(head[2])}</${tag}>`);
    } else if (bullet) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

// -----------------------------------------------------------------------------
// Plotly figure builders — return plain JSON-serialisable specs + a benchmark
// trace-index map so the runtime can show/hide the right traces.
// -----------------------------------------------------------------------------
interface PlotlyFig {
  id: string;
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  benchTraces: { kind: string; index: number }[];
}

const AXIS = {
  gridcolor: "#eef1f4",
  linecolor: "#cfd6dd",
  tickcolor: "#cfd6dd",
  zeroline: false,
  ticks: "outside",
  ticklen: 5,
  automargin: true,
  tickfont: { size: 11.5, color: "#64748b" },
};
function commonLayout(): Record<string, unknown> {
  return {
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: { family: "'IBM Plex Sans','Helvetica Neue',Arial,sans-serif", size: 12.5, color: "#475569" },
    margin: { t: 46, r: 24, b: 48, l: 74 },
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.05,
      xanchor: "left",
      yanchor: "bottom",
      font: { size: 12, color: "#334155" },
      bgcolor: "rgba(0,0,0,0)",
    },
    hovermode: "x unified",
    hoverlabel: {
      bgcolor: "#0f172a",
      bordercolor: "#0f172a",
      font: { family: "'IBM Plex Mono',monospace", size: 12, color: "#ffffff" },
    },
  };
}

function buildEquityFigure(equity: EquityPoint[], benchmarks: ReportBenchmark[]): PlotlyFig {
  const data: Record<string, unknown>[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Strategy",
      x: equity.map((p) => p.ts),
      y: equity.map((p) => p.equity),
      line: { color: C.strategy, width: 2.6 },
      hovertemplate: "%{x|%b %d, %Y}<br><b>$%{y:,.0f}</b><extra>Strategy</extra>",
    },
  ];
  const benchTraces: { kind: string; index: number }[] = [];
  for (const b of benchmarks) {
    data.push({
      type: "scatter",
      mode: "lines",
      name: b.label,
      x: b.equity.map((p) => p.ts),
      y: b.equity.map((p) => p.equity),
      line: { color: b.color, width: 1.6 },
      opacity: 0.9,
      visible: true,
      hovertemplate: `%{x|%b %d, %Y}<br>$%{y:,.0f}<extra>${b.label}</extra>`,
    });
    benchTraces.push({ kind: b.kind, index: data.length - 1 });
  }
  const layout = {
    ...commonLayout(),
    xaxis: { ...AXIS, type: "date", tickformat: "%b %Y" },
    yaxis: { ...AXIS, tickprefix: "$", tickformat: "~s" },
  };
  return { id: "fig-equity", data, layout, benchTraces };
}

/** Underwater curve as a percentage: (equity / running-peak − 1) × 100. Mirrors
 *  DrawdownChart.tsx so the report and the Results page render identically —
 *  drawdown is ≤ 0 (0% at the top, deeper troughs below). We compute it from
 *  the equity series rather than trusting the stored drawdown_pct, whose sign
 *  and scale differ between the strategy (/equity) and benchmark endpoints. */
function underwater(equity: number[]): number[] {
  let peak = -Infinity;
  return equity.map((e) => {
    peak = Math.max(peak, e);
    return peak > 0 ? (e / peak - 1) * 100 : 0;
  });
}
const arrMin = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);

function buildDrawdownFigure(equity: EquityPoint[], benchmarks: ReportBenchmark[]): PlotlyFig {
  const stratDd = underwater(equity.map((p) => p.equity));
  const data: Record<string, unknown>[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Strategy",
      x: equity.map((p) => p.ts),
      y: stratDd,
      line: { color: C.strategy, width: 2.2 },
      fill: "tozeroy",
      fillcolor: "rgba(8,145,178,0.10)",
      hovertemplate: "%{x|%b %d, %Y}<br>%{y:.2f}%<extra>Strategy</extra>",
    },
  ];
  const benchTraces: { kind: string; index: number }[] = [];
  const benchDd: number[][] = [];
  for (const b of benchmarks) {
    const dd = underwater(b.equity.map((p) => p.equity));
    benchDd.push(dd);
    data.push({
      type: "scatter",
      mode: "lines",
      name: b.label,
      x: b.equity.map((p) => p.ts),
      y: dd,
      line: { color: b.color, width: 1.5 },
      opacity: 0.85,
      visible: true,
      hovertemplate: `%{x|%b %d, %Y}<br>%{y:.2f}%<extra>${b.label}</extra>`,
    });
    benchTraces.push({ kind: b.kind, index: data.length - 1 });
  }

  // Annotate the strategy's max-drawdown trough (the most-negative point).
  const annotations: Record<string, unknown>[] = [];
  if (stratDd.length) {
    let wi = 0;
    stratDd.forEach((v, i) => {
      if (v < stratDd[wi]) wi = i;
    });
    annotations.push({
      x: equity[wi].ts,
      y: stratDd[wi],
      text: `Max DD ${stratDd[wi].toFixed(1)}%`,
      showarrow: true,
      arrowhead: 6,
      arrowsize: 1,
      arrowwidth: 1.2,
      arrowcolor: C.neg,
      ax: 0,
      ay: -30,
      font: { family: "'IBM Plex Mono',monospace", size: 11, color: C.neg },
      bgcolor: "rgba(255,255,255,0.88)",
      bordercolor: C.neg,
      borderwidth: 1,
      borderpad: 3,
    });
  }

  // Fix the y-axis from the worst trough across every series up to 0, so 0% sits
  // at the top and deeper drawdowns extend downward — matching DrawdownChart.tsx.
  const worst = Math.min(arrMin(stratDd), ...benchDd.map(arrMin));
  const yaxis: Record<string, unknown> = {
    ...AXIS,
    ticksuffix: "%",
    zeroline: true,
    zerolinecolor: "#cfd6dd",
    zerolinewidth: 1,
  };
  if (Number.isFinite(worst) && worst < 0) yaxis.range = [worst * 1.05, 0];

  const layout = {
    ...commonLayout(),
    xaxis: { ...AXIS, type: "date", tickformat: "%b %Y" },
    yaxis,
    annotations,
  };
  return { id: "fig-drawdown", data, layout, benchTraces };
}

function buildTradePnlFigure(trades: Trade[]): PlotlyFig {
  const xs = trades.map((_, i) => i + 1);
  const ys = trades.map((t) => t.net_pnl);
  const colors = ys.map((v) => (v >= 0 ? C.pos : C.neg));

  const annotations: Record<string, unknown>[] = [];
  if (trades.length) {
    let bi = 0;
    let si = 0;
    ys.forEach((v, i) => {
      if (v > ys[bi]) bi = i;
      if (v < ys[si]) si = i;
    });
    const tag = (i: number, label: string) => ({
      x: i + 1,
      y: ys[i],
      text: `${label} ${money(ys[i])}`,
      showarrow: true,
      arrowhead: 6,
      arrowwidth: 1.2,
      arrowcolor: ys[i] >= 0 ? C.pos : C.neg,
      ay: ys[i] >= 0 ? -26 : 26,
      ax: 0,
      font: { family: "'IBM Plex Mono',monospace", size: 10.5, color: ys[i] >= 0 ? C.pos : C.neg },
      bgcolor: "rgba(255,255,255,0.88)",
      bordercolor: ys[i] >= 0 ? C.pos : C.neg,
      borderwidth: 1,
      borderpad: 3,
    });
    annotations.push(tag(bi, "Best"));
    if (si !== bi) annotations.push(tag(si, "Worst"));
  }

  const layout = {
    ...commonLayout(),
    showlegend: false,
    hovermode: "closest",
    xaxis: { ...AXIS, title: { text: "Trade #", font: { size: 12, color: "#475569" } } },
    yaxis: { ...AXIS, tickprefix: "$", tickformat: "~s", zeroline: true, zerolinecolor: "#cfd6dd", zerolinewidth: 1 },
    annotations,
  };
  const data: Record<string, unknown>[] = [
    {
      type: "bar",
      x: xs,
      y: ys,
      marker: { color: colors },
      hovertemplate: "Trade #%{x}<br>$%{y:,.2f}<extra></extra>",
    },
  ];
  return { id: "fig-tradepnl", data, layout, benchTraces: [] };
}

// -----------------------------------------------------------------------------
// Monthly-returns heatmap (HTML table, green/red graded)
// -----------------------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function heatCell(v: number, scale: number): { bg: string; fg: string } {
  const t = Math.max(-1, Math.min(1, v / scale));
  const a = Math.abs(t);
  const alpha = (0.12 + 0.6 * a).toFixed(3);
  const fg = a > 0.55 ? "#ffffff" : C.ink;
  return v >= 0
    ? { bg: `rgba(21,128,61,${alpha})`, fg }
    : { bg: `rgba(185,28,28,${alpha})`, fg };
}
// Values are already percentages (e.g. 5.0 = +5%), matching the Results page.
const monthPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

function monthlyTable(equity: EquityPoint[]): string {
  // Same computation as the Results-page heatmap (computeMonthlyReturns) so the
  // numbers are identical: within-month return, percentages, annual = year
  // first→last bar.
  const { years, returns, annual } = computeMonthlyReturns(equity);
  if (!years.length) return `<div class="sec-sub">No data available.</div>`;
  // Colour scale: largest absolute monthly return (%), min 2% so a calm series
  // still grades.
  let scale = 2;
  for (const y of years)
    for (let m = 1; m <= 12; m++) {
      const v = returns[y][m];
      if (v != null) scale = Math.max(scale, Math.abs(v));
    }
  const head = `<tr><th></th>${MONTHS.map((m) => `<th>${m}</th>`).join("")}<th>Year</th></tr>`;
  const rows = years
    .map((y) => {
      const cells = MONTHS.map((_, i) => {
        const v = returns[y][i + 1];
        if (v == null) return `<td></td>`;
        const c = heatCell(v, scale);
        return `<td style="background:${c.bg};color:${c.fg}">${monthPct(v)}</td>`;
      }).join("");
      const yr = annual[y] ?? null;
      const yc =
        yr == null
          ? `<td class="yr"></td>`
          : `<td class="yr" style="color:${yr >= 0 ? C.pos : C.neg}">${monthPct(yr)}</td>`;
      return `<tr><td class="lbl">${y}</td>${cells}${yc}</tr>`;
    })
    .join("");
  return `<table class="heat"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

// -----------------------------------------------------------------------------
// Section renderers
// -----------------------------------------------------------------------------
const INFO_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

function renderBanner(hasBench: boolean, mode: ReportMode): string {
  // The PDF render is a static document — no interactive banner or buttons.
  if (mode === "pdf") return "";
  const tip = hasBench
    ? "use the Sections bar to show or hide parts of the report, and the benchmark toggles above each chart to customize your view."
    : "use the Sections bar to show or hide parts of the report, then save the file for a local copy.";
  return `<div class="banner"><div class="banner-txt">${INFO_SVG}<span><b>Interactive report</b> — ${tip}</span></div><div class="banner-actions"><button class="savebtn" type="button" onclick="window.__saveReportHtml&&window.__saveReportHtml()">Save HTML File</button><button class="printbtn" type="button" onclick="window.__printReport&&window.__printReport()">Print / Save as PDF</button></div></div>`;
}

function renderCover(run: BacktestDetail, asset: Asset | undefined, report: Report): string {
  const symbol = asset?.symbol ?? `asset #${run.asset_id}`;
  const name = asset?.name ? ` — ${escapeHtml(asset.name)}` : "";
  const interval = run.timeframe === "1h" ? "Hourly · 1h bars" : "Daily · 1d bars";
  const rows: [string, string][] = [
    ["Asset", `${escapeHtml(symbol)}${name}`],
    ["Backtest Period", `${fmtBacktestDate(run.start_date)} – ${fmtBacktestDate(run.end_date)}`],
    ["Data Interval", interval],
    ["Generated", escapeHtml(formatLocal(report.generated_at))],
  ];
  const demo = report.demo_mode
    ? `<div class="demo-note">Demo mode — narrative generated by the NullProvider (no live LLM call).</div>`
    : "";
  return `<header class="cover">
    <div class="brand"><span class="brand-mark"></span>QuantEdge<span class="brand-sub">Research</span></div>
    <div class="eyebrow">Backtest Performance Report</div>
    <h1 class="title">${escapeHtml(run.strategy_name)}</h1>
    <div class="meta-grid">${rows
      .map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`)
      .join("")}</div>
    ${demo}
  </header>`;
}

interface Kpi {
  label: string;
  sub: string;
  grp: keyof Metrics;
  key: string;
  fmt: (v: number) => string;
  color: Colorer;
}
const KPIS: Kpi[] = [
  { label: "Total Return", sub: "Full period", grp: "return", key: "total_return_pct", fmt: pctSigned, color: signed },
  { label: "CAGR", sub: "Annualized", grp: "return", key: "cagr_pct", fmt: pctSigned, color: signed },
  { label: "Sharpe Ratio", sub: "Risk-adjusted", grp: "risk", key: "sharpe_ratio", fmt: ratio, color: thresh(0.5, 1) },
  { label: "Max Drawdown", sub: "Peak to trough", grp: "risk", key: "max_drawdown_pct", fmt: pctPlain, color: alwaysRed },
  { label: "Win Rate", sub: "Trades won", grp: "trade", key: "win_rate_pct", fmt: pctPlain, color: thresh(40, 55) },
  { label: "Profit Factor", sub: "Gross P / Gross L", grp: "trade", key: "profit_factor", fmt: ratio, color: thresh(1, 1.5) },
];
function renderExecSummary(m: Metrics): string {
  const cards = KPIS.map((d) => {
    const c = cellHtml(m, d.grp, d.key, d.fmt, d.color);
    return `<div class="kpi"><div class="kpi-label">${d.label}</div><div class="kpi-val" style="color:${c.color}">${c.text}</div><div class="kpi-sub">${d.sub}</div></div>`;
  }).join("");
  return `<section class="block"><div class="kicker">Executive Summary</div><div class="kpis">${cards}</div></section>`;
}

type MRow = [string, string, keyof Metrics, string, (v: number) => string, Colorer];
interface MGroup {
  grp: string;
  rows: MRow[];
}
const TABLE: MGroup[] = [
  {
    grp: "Returns",
    rows: [
      ["Total Return", "Full-period gain", "return", "total_return_pct", pctSigned, signed],
      ["CAGR", "Compound annual growth", "return", "cagr_pct", pctSigned, signed],
      ["Annualized Volatility", "Std. dev of returns", "return", "annualized_volatility_pct", pctPlain, neutral],
    ],
  },
  {
    grp: "Risk",
    rows: [
      ["Sharpe Ratio", "Excess return / volatility", "risk", "sharpe_ratio", ratio, thresh(0.5, 1)],
      ["Sortino Ratio", "Excess return / downside vol", "risk", "sortino_ratio", ratio, thresh(0.8, 1.2)],
      ["Calmar Ratio", "CAGR / max drawdown", "risk", "calmar_ratio", ratio, thresh(0.5, 1)],
      ["Max Drawdown", "Worst peak-to-trough", "risk", "max_drawdown_pct", pctPlain, alwaysRed],
      ["Max DD Duration", "Longest underwater stretch", "risk", "max_drawdown_duration_days", daysFmt, neutral],
    ],
  },
  {
    grp: "Trade Statistics",
    rows: [
      ["Total Trades", "Round-trip executions", "trade", "total_trades", intFmt, neutral],
      ["Win Rate", "Profitable trades", "trade", "win_rate_pct", pctPlain, thresh(40, 55)],
      ["Average Win", "Mean winning P&L", "trade", "avg_win", money, alwaysGreen],
      ["Average Loss", "Mean losing P&L", "trade", "avg_loss", money, alwaysRed],
      ["Win/Loss Ratio", "Avg win / avg loss", "trade", "win_loss_ratio", ratioX, alwaysGreen],
      ["Profit Factor", "Gross profit / gross loss", "trade", "profit_factor", ratio, thresh(1, 1.5)],
    ],
  },
];
function renderMetricsTable(m: Metrics): string {
  let i = 0;
  const out: string[] = [];
  for (const g of TABLE) {
    out.push(`<tr class="grp"><td colspan="2">${g.grp}</td></tr>`);
    for (const r of g.rows) {
      const c = cellHtml(m, r[2], r[3], r[4], r[5]);
      const alt = i++ % 2 === 1 ? " alt" : "";
      out.push(
        `<tr class="${alt.trim()}"><td class="ml">${r[0]}<span class="sub">${r[1]}</span></td><td class="mv" style="color:${c.color}">${c.text}</td></tr>`,
      );
    }
  }
  return `<section class="block"><div class="kicker">Performance Metrics</div><h2 class="sec-title">Full Metrics</h2><p class="sec-sub">All computed statistics, grouped by category.</p><table class="metrics"><tbody>${out.join("")}</tbody></table></section>`;
}

type CRow = [string, keyof Metrics, string, (v: number) => string, Colorer];
const CMP: CRow[] = [
  ["CAGR", "return", "cagr_pct", pctSigned, signed],
  ["Total Return", "return", "total_return_pct", pctSigned, signed],
  ["Ann. Volatility", "return", "annualized_volatility_pct", pctPlain, neutral],
  ["Max Drawdown", "risk", "max_drawdown_pct", pctPlain, alwaysRed],
  ["Sharpe", "risk", "sharpe_ratio", ratio, thresh(0.5, 1)],
  ["Sortino", "risk", "sortino_ratio", ratio, thresh(0.8, 1.2)],
];
function renderComparison(m: Metrics, benchmarks: ReportBenchmark[]): string {
  if (!benchmarks.length) return "";
  const cols: { label: string; color: string; m: Metrics | null }[] = [
    { label: "Strategy", color: C.strategy, m },
    ...benchmarks.map((b) => ({ label: b.label, color: b.color, m: b.metrics })),
  ];
  const head = `<tr><th></th>${cols
    .map((c) => `<th>${escapeHtml(c.label)}<span class="chip" style="background:${c.color}"></span></th>`)
    .join("")}</tr>`;
  const rows = CMP.map((r) => {
    const tds = cols
      .map((c) => {
        const cell = cellHtml(c.m, r[1], r[2], r[3], r[4]);
        return `<td style="color:${cell.color}">${cell.text}</td>`;
      })
      .join("");
    return `<tr><td>${r[0]}</td>${tds}</tr>`;
  }).join("");
  return `<section class="block"><div class="kicker">Comparison</div><h2 class="sec-title">Strategy vs. Benchmarks</h2><p class="sec-sub">Headline metrics side by side. Each value is colored on its own merits.</p><table class="cmp"><thead>${head}</thead><tbody>${rows}</tbody></table></section>`;
}

function togBar(benchmarks: ReportBenchmark[]): string {
  const strat = `<span class="tog strat" style="--c:${C.strategy}"><span class="dot"></span>Strategy</span>`;
  const btns = benchmarks
    .map(
      (b) =>
        `<button type="button" class="tog on" data-bench-btn="${b.kind}" aria-pressed="true" style="--c:${b.color}"><span class="dot"></span>${escapeHtml(b.label)}</button>`,
    )
    .join("");
  return `<div class="togbar">${strat}${btns}</div>`;
}

/** Non-interactive version of togBar for the PDF render: shows which series are
 *  active (all of them, at generation time) as a static legend, no buttons. */
function staticLegend(benchmarks: ReportBenchmark[]): string {
  const chip = (label: string, color: string) =>
    `<span class="tog on" style="--c:${color}"><span class="dot"></span>${escapeHtml(label)}</span>`;
  const items = [chip("Strategy", C.strategy), ...benchmarks.map((b) => chip(b.label, b.color))].join("");
  return `<div class="togbar">${items}</div>`;
}

// Short labels for the in-report "Sections" bar (interactive only). Keys mirror
// ReportSections so the PDF picker and the live report stay in lock-step.
const SECTION_LABELS: Record<keyof ReportSections, string> = {
  summary: "Summary",
  metrics: "Metrics",
  comparison: "Comparison",
  equity: "Equity",
  drawdown: "Drawdown",
  monthly: "Monthly",
  trades: "Trades",
  commentary: "AI Analysis",
  params: "Parameters",
};

/** Live section show/hide bar for the interactive report — one pill per section
 *  actually present, all ON by default. The runtime toggles `[data-section]`. */
function renderSectionBar(keys: (keyof ReportSections)[]): string {
  if (!keys.length) return "";
  const btns = keys
    .map(
      (k) =>
        `<button type="button" class="sectog on" data-section-btn="${k}" aria-pressed="true">${SECTION_LABELS[k]}</button>`,
    )
    .join("");
  return `<div class="sectionbar"><span class="sectionbar-label">Sections</span><div class="sectionbar-btns">${btns}</div></div>`;
}

function chartSection(
  kicker: string,
  title: string,
  sub: string,
  figId: string,
  benchmarks: ReportBenchmark[] | null,
  tall: boolean,
  mode: ReportMode,
): string {
  const bar = benchmarks && benchmarks.length ? (mode === "pdf" ? staticLegend(benchmarks) : togBar(benchmarks)) : "";
  return `<section class="block chart-block"><div class="kicker">${kicker}</div><h2 class="sec-title">${title}</h2><p class="sec-sub">${sub}</p>${bar}<div id="${figId}" class="chart${tall ? " tall" : ""}"></div></section>`;
}

function renderMonthly(equity: EquityPoint[], benchmarks: ReportBenchmark[]): string {
  const heatBlock = (label: string, color: string, eq: EquityPoint[], kind: string | null) => {
    const cap = `<div class="heat-cap"><span class="chip" style="background:${color}"></span>${escapeHtml(label)}</div>`;
    const attr = kind ? ` data-bench-block="${kind}"` : "";
    return `<div class="heat-block"${attr}>${cap}<div class="heat-wrap">${monthlyTable(eq)}</div></div>`;
  };
  const blocks = [heatBlock("Strategy", C.strategy, equity, null)];
  for (const b of benchmarks) blocks.push(heatBlock(b.label, b.color, b.equity, b.kind));
  const sub = benchmarks.length
    ? "Calendar-month returns for the strategy and active benchmarks. Benchmark grids follow the global toggles. Green = gain, red = loss."
    : "Calendar-month returns for the strategy. Green = gain, red = loss.";
  return `<section class="block"><div class="kicker">Monthly Returns</div><h2 class="sec-title">Monthly Return Heatmap</h2><p class="sec-sub">${sub}</p>${blocks.join("")}</section>`;
}

function renderCommentary(report: Report): string {
  const note = report.demo_mode
    ? "Demo mode — generated by the NullProvider (no live LLM call)."
    : `Generated by ${escapeHtml(report.model)}.`;
  return `<section class="block"><div class="kicker">Analyst Commentary</div><h2 class="sec-title">AI Analysis</h2><div class="prose">${mdToHtml(report.text || "")}</div><div class="model-note">${note}</div></section>`;
}

function renderParams(run: BacktestDetail, asset: Asset | undefined): string {
  const rows: [string, string][] = [
    ["Strategy", escapeHtml(run.strategy_name)],
    ["Ticker", escapeHtml(asset?.symbol ?? `#${run.asset_id}`)],
    ["Asset Name", escapeHtml(asset?.name ?? "—")],
    ["Asset Class", escapeHtml(asset?.asset_class ?? "—")],
    ["Data Interval", run.timeframe === "1h" ? "Hourly (1h)" : "Daily (1d)"],
    ["Start Date", fmtBacktestDate(run.start_date)],
    ["End Date", fmtBacktestDate(run.end_date)],
  ];
  const params = run.params ?? {};
  for (const k of Object.keys(params)) rows.push([prettyKey(k), fmtParamVal(params[k])]);
  const body = rows.map(([k, v]) => `<tr><td class="pk">${k}</td><td class="pv">${v}</td></tr>`).join("");
  return `<section class="block"><div class="kicker">Appendix</div><h2 class="sec-title">Run Parameters</h2><p class="sec-sub">Full configuration used for this backtest run.</p><table class="params"><tbody>${body}</tbody></table></section>`;
}

function renderFooter(report: Report): string {
  return `<footer class="foot"><span class="disc">AI analysis is not financial advice. Past performance does not guarantee future results. Figures are gross of taxes and reflect only the modeled commission and slippage.</span><span class="foot-meta">QuantEdge · Generated ${escapeHtml(formatLocal(report.generated_at))}</span></footer>`;
}

// -----------------------------------------------------------------------------
// Inlined assets: fonts, stylesheet, toggle runtime
// -----------------------------------------------------------------------------
const FONT_CSS = `
@font-face{font-family:'IBM Plex Serif';font-style:normal;font-weight:500;font-display:swap;src:url(${serif500}) format('woff2')}
@font-face{font-family:'IBM Plex Serif';font-style:normal;font-weight:600;font-display:swap;src:url(${serif600}) format('woff2')}
@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:400;font-display:swap;src:url(${sans400}) format('woff2')}
@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:600;font-display:swap;src:url(${sans600}) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:400;font-display:swap;src:url(${mono400}) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:500;font-display:swap;src:url(${mono500}) format('woff2')}`;

const CSS = `
:root{--page:${C.page};--card:${C.card};--ink:${C.ink};--body:${C.body};--muted:${C.muted};--faint:${C.faint};--hair:${C.hair};--rowalt:${C.rowalt};--cy:${C.strategy};--pos:${C.pos};--neg:${C.neg};--warn:${C.warn}}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--page);color:var(--body);font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;padding:40px 20px}
.doc{max-width:1000px;margin:0 auto;background:var(--card);border:1px solid var(--hair);border-radius:7px;box-shadow:0 12px 44px rgba(15,23,42,.09),0 2px 8px rgba(15,23,42,.04);overflow:hidden}
.accentbar{height:4px;background:linear-gradient(90deg,#0e7490,#22d3ee 55%,#67e8f9)}
.block{padding:34px 56px;border-top:1px solid var(--hair)}
.kicker{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--cy);font-weight:500;margin-bottom:14px}
.sec-title{font-family:'IBM Plex Serif',Georgia,serif;font-weight:600;font-size:22px;color:var(--ink);margin:0 0 4px;letter-spacing:-.01em}
.sec-sub{font-size:13px;color:var(--muted);margin:0 0 20px;max-width:64ch}
/* Cover */
.cover{padding:46px 56px 38px}
.brand{display:flex;align-items:center;gap:9px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.22em;color:var(--ink);font-weight:600;text-transform:uppercase;margin-bottom:30px}
.brand-mark{width:13px;height:13px;background:var(--cy);border-radius:2px}
.brand-sub{color:var(--faint);font-weight:500}
.eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.title{font-family:'IBM Plex Serif',Georgia,serif;font-weight:600;font-size:38px;line-height:1.12;color:var(--ink);margin:0 0 26px;letter-spacing:-.02em}
.meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 40px;max-width:700px;border-top:1px solid var(--hair);padding-top:22px}
.meta-grid .k{display:block;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:3px}
.meta-grid .v{display:block;font-size:14.5px;color:var(--ink);font-weight:500}
.demo-note{margin-top:18px;font-size:12px;color:var(--warn);background:#fffbeb;border:1px solid #fde68a;padding:8px 12px;border-radius:6px;display:inline-block}
/* Banner */
.banner{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#ecfeff;border-bottom:1px solid #cffafe;padding:13px 56px;color:#155e75}
.banner-txt{font-size:13px;display:flex;align-items:center;gap:10px}
.banner-txt b{color:#0e7490}
.banner-txt svg{flex:none;color:#0891b2}
.banner-actions{flex:none;display:flex;align-items:center;gap:8px}
.savebtn{font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:12.5px;color:#fff;background:var(--cy);border:none;border-radius:6px;padding:8px 16px;cursor:pointer}
.savebtn:hover{background:#0e7490}
.printbtn{font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:12.5px;color:var(--cy);background:transparent;border:1.5px solid var(--cy);border-radius:6px;padding:6.5px 14px;cursor:pointer}
.printbtn:hover{background:var(--cy);color:#fff}
/* Section toggles (interactive only) */
.sectionbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:11px 56px;background:#f8fafc;border-bottom:1px solid var(--hair)}
.sectionbar-label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;flex:none}
.sectionbar-btns{display:flex;gap:7px;flex-wrap:wrap}
.sectog{font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:11.5px;padding:5px 12px;border-radius:999px;border:1.5px solid var(--hair);background:#fff;color:var(--muted);cursor:pointer;transition:background .12s,color .12s,border-color .12s}
.sectog.on{background:var(--cy);border-color:var(--cy);color:#fff}
.sectog.off{background:#fff;color:var(--faint)}
.sectog.off:hover{border-color:var(--cy);color:var(--cy)}
/* KPIs */
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:7px;overflow:hidden}
.kpi{background:var(--card);padding:20px 22px}
.kpi-label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:13px}
.kpi-val{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:30px;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi-sub{font-size:12px;color:var(--faint);margin-top:10px}
/* Metrics table */
table.metrics{width:100%;border-collapse:collapse;font-size:13.5px}
table.metrics td{padding:9px 4px;border-bottom:1px solid var(--hair)}
table.metrics tr.alt td{background:var(--rowalt)}
table.metrics tr.grp td{background:transparent;border-bottom:2px solid var(--ink);padding:24px 4px 7px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink);font-weight:600}
table.metrics tr.grp:first-child td{padding-top:4px}
td.ml{color:var(--body)}
td.ml .sub{display:block;font-size:11.5px;color:var(--faint);margin-top:1px}
td.mv{text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;width:150px}
/* Comparison */
table.cmp{width:100%;border-collapse:collapse;font-size:13.5px}
table.cmp th{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;text-align:right;padding:0 4px 12px;border-bottom:1px solid var(--hair);white-space:nowrap}
table.cmp th:first-child{text-align:left}
table.cmp th .chip{display:inline-block;width:20px;height:3px;border-radius:2px;margin-left:8px;vertical-align:middle}
table.cmp td{padding:10px 4px;border-bottom:1px solid var(--hair);text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;font-variant-numeric:tabular-nums}
table.cmp td:first-child{text-align:left;font-family:'IBM Plex Sans',sans-serif;font-weight:400;color:var(--body)}
table.cmp tr:last-child td{border-bottom:none}
/* Toggles + charts */
.togbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.tog{display:inline-flex;align-items:center;gap:7px;font-family:'IBM Plex Sans',sans-serif;font-weight:600;font-size:12px;padding:6px 13px;border-radius:999px;border:1.5px solid var(--c);background:transparent;color:var(--c);cursor:pointer;transition:background .12s,color .12s,opacity .12s}
.tog .dot{width:9px;height:9px;border-radius:50%;background:var(--c);flex:none}
.tog.on{background:var(--c);color:#fff}
.tog.on .dot{background:#fff}
.tog.off{opacity:.62}
.tog.off:hover{opacity:1}
.tog.strat{cursor:default;background:var(--c);color:#fff}
.tog.strat .dot{background:#fff}
.chart{width:100%;height:340px}
.chart.tall{height:460px}
/* Monthly heatmap */
.heat-block{margin-top:20px}
.heat-cap{display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:12.5px;color:var(--body);font-weight:600}
.heat-cap .chip{width:11px;height:11px;border-radius:2px;flex:none}
.heat-wrap{overflow-x:auto}
table.heat{border-collapse:separate;border-spacing:3px;font-family:'IBM Plex Mono',monospace;font-size:11.5px}
table.heat th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;padding:4px 6px;text-align:center}
table.heat td{padding:7px 9px;text-align:right;border-radius:3px;color:var(--ink);min-width:50px;font-variant-numeric:tabular-nums;background:#f4f5f6}
table.heat td.lbl{text-align:left;color:var(--body);font-weight:600;background:transparent}
table.heat td.yr{font-weight:600;background:transparent;border-left:2px solid var(--hair)}
/* Prose */
.prose{font-size:14px;color:var(--body);line-height:1.72}
.prose h3{font-family:'IBM Plex Serif',Georgia,serif;font-size:16.5px;color:var(--ink);font-weight:600;margin:22px 0 8px}
.prose h4{font-family:'IBM Plex Sans',sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink);font-weight:600;margin:18px 0 6px}
.prose p{margin:0 0 12px}
.prose ul{margin:0 0 14px;padding-left:20px}
.prose li{margin:0 0 6px}
.prose strong{color:var(--ink);font-weight:600}
.prose code{font-family:'IBM Plex Mono',monospace;font-size:12.5px;background:#f1f5f9;padding:1px 5px;border-radius:3px}
.model-note{margin-top:18px;font-size:12px;color:var(--faint);font-style:italic}
/* Params */
table.params{width:100%;border-collapse:collapse;font-size:13.5px}
table.params td{padding:9px 4px;border-bottom:1px solid var(--hair)}
table.params td.pk{color:var(--muted);width:42%}
table.params td.pv{font-family:'IBM Plex Mono',monospace;color:var(--ink);font-weight:500;text-align:right;font-variant-numeric:tabular-nums}
table.params tr:last-child td{border-bottom:none}
/* Footer */
.foot{padding:24px 56px 34px;border-top:1px solid var(--hair);color:var(--faint);font-size:11.5px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.foot .disc{max-width:62ch;font-style:italic}
.foot-meta{font-family:'IBM Plex Mono',monospace;white-space:nowrap}
@media (max-width:680px){.kpis{grid-template-columns:repeat(2,1fr)}.meta-grid{grid-template-columns:1fr}.block,.cover,.banner,.foot{padding-left:24px;padding-right:24px}}
@page{size:A4;margin:12mm}
@media print{
  body{background:#fff;padding:0}
  /* overflow:visible is critical: the base .doc is overflow:hidden, which clips
     every printed page after the first (Safari renders the whole job blank). */
  .doc{box-shadow:none;border:none;border-radius:0;max-width:none;overflow:visible}
  /* The banner is interactive-only guidance ("use the Sections bar…") — drop it
     entirely from the PDF along with the toolbar and section pills. */
  .banner,.banner-actions,.sectionbar{display:none}
  .block,.cover{padding:22px 28px}
  /* Keep only genuinely-unsplittable units intact. Letting sections, chart-blocks
     and the metrics/params tables FLOW (rows stay whole via tr) avoids the big
     white gaps that page-break-inside:avoid on whole sections used to create. */
  .chart,.kpi,.heat-block,table.heat,tr,.cover{page-break-inside:avoid}
  /* Keep a chart's heading/legend glued to the chart so it isn't orphaned. */
  .kicker,.sec-title,.sec-sub,.togbar{break-after:avoid;page-break-after:avoid}
  /* Cap chart size for print. max-width is the key guard: Plotly's responsive
     ResizeObserver resizes a chart to its container, so without a hard cap a wide
     print viewport (notably Safari, which keeps the screen viewport during print)
     would size charts past the page edge and truncate them. Capping the box means
     the chart can never exceed the printable width. Heights are capped so a chart
     always fits within one page (no vertical split). Centered for a clean margin. */
  .chart{height:300px;max-width:580px;margin-left:auto;margin-right:auto}
  .chart.tall{height:360px}
  /* Monthly heatmap is a 14-column table (label + 12 months + Year). On screen it
     scrolls via overflow-x:auto, but print can't scroll, so it was clipped after
     ~October. Fix the layout to the page width so every month + the Year fit. */
  .heat-wrap{overflow:visible}
  table.heat{width:100%;table-layout:fixed;border-spacing:2px;font-size:8.5px}
  table.heat th{padding:3px 1px;font-size:8px}
  table.heat td{padding:4px 2px;min-width:0}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;

const TOGGLE_RUNTIME = `
(function(){
  var R = window.__REPORT__ || {};
  var figs = R.figures || [];
  var state = R.toggles || {};
  var cfg = { responsive:true, displayModeBar:false };
  // Signal to the headless-Chromium PDF renderer that every figure has drawn.
  function ready(){ window.__REPORT_READY__ = true; }
  if(window.Plotly){
    var proms = figs.map(function(f){
      var el = document.getElementById(f.id);
      return el ? Plotly.newPlot(el, f.data, f.layout, cfg) : null;
    });
    (Promise.all(proms)).then(ready).catch(ready);
  } else { ready(); }
  // Opt-in "Save HTML File": re-fetch this document's own (un-revoked) blob URL
  // for a byte-faithful copy and download it under the report's filename.
  window.__saveReportHtml = function(){
    var name = R.filename || 'backtest_report.html';
    fetch(location.href).then(function(r){ return r.blob(); }).then(function(b){
      var u = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = u; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(u); }, 1000);
    }).catch(function(e){ alert('Could not save the HTML file: ' + e); });
  };
  function applyBench(kind, on){
    state[kind] = on;
    figs.forEach(function(f){
      var el = document.getElementById(f.id);
      if(!el || !window.Plotly) return;
      var idx = (f.benchTraces||[]).filter(function(b){return b.kind===kind;}).map(function(b){return b.index;});
      if(idx.length){
        Plotly.restyle(el, { visible: on ? true : false }, idx);
        Plotly.relayout(el, { 'yaxis.autorange': true });
      }
    });
    document.querySelectorAll('[data-bench-block="'+kind+'"]').forEach(function(el){ el.style.display = on ? '' : 'none'; });
    document.querySelectorAll('[data-bench-btn="'+kind+'"]').forEach(function(btn){
      btn.classList.toggle('on', on);
      btn.classList.toggle('off', !on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }
  document.querySelectorAll('[data-bench-btn]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var kind = btn.getAttribute('data-bench-btn');
      applyBench(kind, !state[kind]);
    });
  });
  // Section show/hide — the in-report "Sections" bar. All sections start visible.
  function applySection(key, on){
    document.querySelectorAll('[data-section="'+key+'"]').forEach(function(el){ el.style.display = on ? '' : 'none'; });
    document.querySelectorAll('[data-section-btn="'+key+'"]').forEach(function(btn){
      btn.classList.toggle('on', on);
      btn.classList.toggle('off', !on);
      btn.setAttribute('aria-pressed', String(on));
    });
    // A chart revealed after the window changed size needs Plotly to re-fit.
    if(on && window.Plotly){
      figs.forEach(function(f){ var el=document.getElementById(f.id); if(el){ try{ Plotly.Plots.resize(el); }catch(e){} } });
    }
  }
  document.querySelectorAll('[data-section-btn]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var key = btn.getAttribute('data-section-btn');
      applySection(key, !btn.classList.contains('on'));
    });
  });
  // Print path. On screen the charts are responsive (~900px wide), but the print
  // layout is the narrow A4 content box (~650px). Resize every figure to a fixed
  // print width BEFORE invoking print — explicit dimensions, not a container
  // measurement, so this is independent of when the browser switches to print
  // media (Safari fires 'beforeprint' BEFORE the switch, which is why charts used
  // to overflow the page and get cut off). afterprint restores the screen sizing.
  var PRINT_W = 580; // matches the .chart print max-width; fits the A4 content box
  function sizeForPrint(){
    if(!window.Plotly) return;
    figs.forEach(function(f){
      var el = document.getElementById(f.id);
      if(!el) return;
      var h = el.classList.contains('tall') ? 360 : 300;
      try{ Plotly.relayout(el, { width: PRINT_W, height: h, autosize: false }); }catch(e){}
    });
  }
  function sizeForScreen(){
    if(!window.Plotly) return;
    figs.forEach(function(f){
      var el = document.getElementById(f.id);
      if(!el) return;
      try{ Plotly.relayout(el, { width: null, height: null, autosize: true }); Plotly.Plots.resize(el); }catch(e){}
    });
  }
  // Invoked by the "Print / Save as PDF" button: pre-size the charts, let Plotly
  // paint the resized SVGs, then open the print dialog (which yields window.print()).
  window.__printReport = function(){
    sizeForPrint();
    setTimeout(function(){ window.print(); }, 250);
  };
  // Fallbacks for a direct Cmd/Ctrl+P (no button): size on beforeprint, restore after.
  window.addEventListener('beforeprint', sizeForPrint);
  window.addEventListener('afterprint', sizeForScreen);
})();`;

// -----------------------------------------------------------------------------
// Pure builder (unit-testable) — assembles the document string + filename.
// -----------------------------------------------------------------------------
export function buildReportHtml(
  payload: ReportPayload,
  plotlySource: string,
  mode: ReportMode = "interactive",
  sections?: ReportSections,
): { html: string; filename: string } {
  const { run, asset, metrics, equity, trades, benchmarks, report } = payload;
  const hasBench = benchmarks.length > 0;
  const on = (k: keyof ReportSections) => sections?.[k] !== false; // default: included

  // Only build (and inline) the figures for sections that are actually kept.
  const figures: PlotlyFig[] = [];
  if (on("equity")) figures.push(buildEquityFigure(equity, benchmarks));
  if (on("drawdown")) figures.push(buildDrawdownFigure(equity, benchmarks));
  const tradeFig = on("trades") && trades.length ? buildTradePnlFigure(trades) : null;
  if (tradeFig) figures.push(tradeFig);

  const toggles: Record<string, boolean> = {};
  for (const b of benchmarks) toggles[b.kind] = true;

  const filename = `${slug(run.strategy_name)}_${slug(asset?.symbol ?? "asset")}_${run.start_date.slice(
    0,
    10,
  )}_${run.end_date.slice(0, 10)}_report.html`;

  const tradeSection = !on("trades")
    ? ""
    : tradeFig
      ? chartSection(
          "Trade Analysis",
          "Trade Profit &amp; Loss",
          "Net P&amp;L of each closed trade after commission and slippage. The best and worst trades are annotated.",
          "fig-tradepnl",
          null,
          false,
          mode,
        )
      : `<section class="block"><div class="kicker">Trade Analysis</div><h2 class="sec-title">Trade Profit &amp; Loss</h2><p class="sec-sub">No trades were executed in this run.</p></section>`;

  // Each toggleable section, in document order. Empty entries (dropped by the
  // PDF picker, or a renderer that produced nothing — e.g. the comparison table
  // with no benchmarks) are removed so they get no stray toggle.
  const sectionEntries: { key: keyof ReportSections; html: string }[] = [
    { key: "summary", html: on("summary") ? renderExecSummary(metrics) : "" },
    { key: "metrics", html: on("metrics") ? renderMetricsTable(metrics) : "" },
    { key: "comparison", html: on("comparison") ? renderComparison(metrics, benchmarks) : "" },
    {
      key: "equity",
      html: on("equity")
        ? chartSection(
            "Performance",
            "Equity Curve",
            "Growth of the modeled portfolio over the test window, against the selected benchmarks.",
            "fig-equity",
            benchmarks,
            true,
            mode,
          )
        : "",
    },
    {
      key: "drawdown",
      html: on("drawdown")
        ? chartSection(
            "Risk",
            "Drawdown",
            "Peak-to-trough decline at each point in time. Deeper is worse; the strategy trough is annotated.",
            "fig-drawdown",
            benchmarks,
            false,
            mode,
          )
        : "",
    },
    { key: "monthly", html: on("monthly") ? renderMonthly(equity, benchmarks) : "" },
    { key: "trades", html: tradeSection },
    { key: "commentary", html: on("commentary") ? renderCommentary(report) : "" },
    { key: "params", html: on("params") ? renderParams(run, asset) : "" },
  ];
  const presentSections = sectionEntries.filter((e) => e.html);

  // Interactive mode wraps each section so the in-report "Sections" bar can show
  // / hide it live; pdf mode emits the sections plainly (the picker already chose).
  const sectionBlocks =
    mode === "interactive"
      ? presentSections.map((e) => `<div data-section="${e.key}">${e.html}</div>`).join("\n")
      : presentSections.map((e) => e.html).join("\n");

  const body = [
    `<div class="accentbar"></div>`,
    renderBanner(hasBench, mode),
    mode === "interactive" ? renderSectionBar(presentSections.map((e) => e.key)) : "",
    renderCover(run, asset, report),
    sectionBlocks,
    renderFooter(report),
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(
    run.strategy_name,
  )} — Backtest Report</title><style>${FONT_CSS}\n${CSS}</style></head><body><main class="doc">${body}</main><script>${plotlySource}</script><script>window.__REPORT__=${jsonEmbed(
    { figures, toggles, filename },
  )};</script><script>${TOGGLE_RUNTIME}</script></body></html>`;

  return { html, filename };
}

// -----------------------------------------------------------------------------
// IO — fetch data, inline Plotly, build, then deliver (view / download / PDF).
// -----------------------------------------------------------------------------
const BENCH_DEFS: { kind: BenchmarkKind; label: string; color: string }[] = [
  { kind: "buy_and_hold", label: "Buy & Hold", color: C.bh },
  { kind: "sp500", label: "S&P 500", color: C.spx },
];

/** Fetch every input for a run and build the report document. Shared by all
 *  delivery paths so they emit identical content (apart from interactive vs.
 *  pdf mode). */
export async function buildReportArtifacts(
  runId: number,
  report: Report,
  mode: ReportMode = "interactive",
  sections?: ReportSections,
): Promise<{ html: string; filename: string }> {
  const [run, assets, metrics, equity, trades, benchEq, benchMt] = await Promise.all([
    Api.getBacktest(runId),
    Api.listAssets(),
    Api.getMetrics(runId),
    Api.getEquity(runId),
    Api.getTrades(runId),
    // Benchmarks may not exist for every run — tolerate per-kind failures.
    Promise.allSettled([Api.getBenchmarkEquity(runId, "buy_and_hold"), Api.getBenchmarkEquity(runId, "sp500")]),
    Promise.allSettled([Api.getBenchmarkMetrics(runId, "buy_and_hold"), Api.getBenchmarkMetrics(runId, "sp500")]),
  ]);

  const asset = assets.find((a) => a.id === run.asset_id);

  const benchmarks: ReportBenchmark[] = [];
  BENCH_DEFS.forEach((d, i) => {
    const eq = benchEq[i];
    if (eq.status === "fulfilled" && eq.value.length > 0) {
      const mt = benchMt[i];
      benchmarks.push({
        ...d,
        equity: eq.value,
        metrics: mt.status === "fulfilled" ? mt.value : null,
      });
    }
  });

  const payload: ReportPayload = { runId, run, asset, metrics, equity, trades, benchmarks, report };

  // Inline the full Plotly library (lazy chunk) so the file works offline.
  const plotlySource = (await import("plotly.js-dist-min/plotly.min.js?raw")).default;

  return buildReportHtml(payload, plotlySource, mode, sections);
}

/** Download the interactive report as a standalone .html file. */
export async function downloadReportHtml(runId: number, report: Report): Promise<void> {
  const { html, filename } = await buildReportArtifacts(runId, report, "interactive");
  triggerBlobDownload(new Blob([html], { type: "text/html;charset=utf-8" }), filename);
}

/**
 * Open the interactive report in a new browser tab. The caller should open the
 * window synchronously inside the click handler and pass it here, so the popup
 * survives the async build (post-`await` `window.open` is blocked by browsers).
 * The blob URL is deliberately NOT revoked: the in-report "Save HTML File"
 * button re-fetches it to produce a byte-faithful download.
 */
export async function openReportHtml(runId: number, report: Report, win: Window | null): Promise<void> {
  const { html } = await buildReportArtifacts(runId, report, "interactive");
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  if (win && !win.closed) win.location.href = url;
  else window.open(url, "_blank");
}

/** Download a true, static PDF rendered by the backend (headless Chromium).
 *  `sections` lets the caller keep only the parts they want (default: all). */
export async function downloadReportPdf(
  runId: number,
  report: Report,
  sections?: ReportSections,
): Promise<void> {
  const { html, filename } = await buildReportArtifacts(runId, report, "pdf", sections);
  const pdf = await Api.renderReportPdf(runId, html);
  triggerBlobDownload(pdf, filename.replace(/\.html$/, ".pdf"));
}

/** Back-compat alias for the original auto-download entry point. */
export const exportReportHtml = downloadReportHtml;

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
