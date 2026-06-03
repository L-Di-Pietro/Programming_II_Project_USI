import { describe, expect, it } from "vitest";

import type { Asset, BacktestDetail, EquityPoint, Metrics, Report, Trade } from "@/api/client";
import { buildReportHtml, type ReportBenchmark, type ReportPayload } from "./exportReportHtml";

const PLOTLY_STUB = "/*__PLOTLY_STUB__*/";

interface EmbeddedFig {
  id: string;
  data: { y?: number[] }[];
  benchTraces: { kind: string; index: number }[];
}
interface EmbeddedReport {
  figures: EmbeddedFig[];
  toggles: Record<string, boolean>;
  filename: string;
}

/** Pull the inlined `window.__REPORT__` chart payload back out of the document. */
function extractReportData(html: string): EmbeddedReport {
  const m = html.match(/window\.__REPORT__=(.+?);<\/script>/s);
  if (!m) throw new Error("no __REPORT__ payload found");
  return JSON.parse(m[1]) as EmbeddedReport;
}

function mkMetrics(): Metrics {
  return {
    return: { total_return_pct: 42.5, cagr_pct: 9.1, annualized_volatility_pct: 14.2 },
    risk: {
      sharpe_ratio: 1.23,
      sortino_ratio: 1.8,
      calmar_ratio: 0.9,
      max_drawdown_pct: -12.7,
      max_drawdown_duration_days: 58,
    },
    trade: {
      total_trades: 24,
      win_rate_pct: 58.3,
      avg_win: 210.5,
      avg_loss: -90.25,
      win_loss_ratio: 2.33,
      profit_factor: 1.7,
    },
  };
}

function mkEquity(base: number): EquityPoint[] {
  const days = ["2020-01-31", "2020-02-28", "2020-03-31", "2021-01-29", "2021-12-31"];
  return days.map((d, i) => ({
    ts: `${d}T00:00:00Z`,
    equity: base * (1 + i * 0.05),
    cash: 0,
    position_value: 0,
    drawdown_pct: i === 2 ? -12.7 : -1.5 * i,
  }));
}

function mkTrades(): Trade[] {
  return [
    { id: 1, ts: "2020-02-01T00:00:00Z", side: "buy", qty: 1, price: 100, commission: 0, slippage_cost: 0, gross_pnl: 0, net_pnl: 300 },
    { id: 2, ts: "2020-03-01T00:00:00Z", side: "sell", qty: 1, price: 110, commission: 0, slippage_cost: 0, gross_pnl: 0, net_pnl: -120 },
  ];
}

function mkRun(overrides: Partial<BacktestDetail> = {}): BacktestDetail {
  return {
    id: 7,
    strategy_id: 1,
    strategy_name: "SMA Crossover",
    asset_id: 3,
    asset_symbol: "SPY",
    timeframe: "1d",
    start_date: "2020-01-01T00:00:00Z",
    end_date: "2024-01-01T00:00:00Z",
    status: "completed",
    error_message: null,
    created_at: "2024-01-01T00:00:00Z",
    completed_at: "2024-01-01T00:00:00Z",
    has_report: true,
    report_generated_at: "2024-01-02T00:00:00Z",
    params: { fast_window: 10, slow_window: 30 },
    ...overrides,
  };
}

function mkAsset(): Asset {
  return {
    id: 3,
    symbol: "SPY",
    asset_class: "etf",
    name: "SPDR S&P 500 ETF",
    exchange: "NYSE",
    currency: "USD",
    is_active: true,
  };
}

function mkReport(overrides: Partial<Report> = {}): Report {
  return {
    text: "## Summary\n\nThe strategy outperformed.\n\n- Strong risk-adjusted returns\n- Shallow drawdowns",
    model: "gemini-2.0",
    demo_mode: false,
    generated_at: "2024-01-02T00:00:00Z",
    cached: false,
    prompt_tokens: 100,
    completion_tokens: 200,
    ...overrides,
  };
}

function mkBenchmark(kind: "buy_and_hold" | "sp500", label: string, base: number): ReportBenchmark {
  return { kind, label, color: "#2563eb", equity: mkEquity(base), metrics: mkMetrics() };
}

function mkPayload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    runId: 7,
    run: mkRun(),
    asset: mkAsset(),
    metrics: mkMetrics(),
    equity: mkEquity(10_000),
    trades: mkTrades(),
    benchmarks: [mkBenchmark("buy_and_hold", "Buy & Hold", 10_000), mkBenchmark("sp500", "S&P 500", 10_000)],
    report: mkReport(),
    ...overrides,
  };
}

describe("buildReportHtml", () => {
  it("produces the {Strategy}_{Ticker}_{Start}_{End}_report.html filename", () => {
    const { filename } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(filename).toBe("SMA_Crossover_SPY_2020-01-01_2024-01-01_report.html");
  });

  it("emits a well-formed standalone document with the inlined Plotly + data + runtime", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain(PLOTLY_STUB); // full Plotly library is inlined
    expect(html).toContain("window.__REPORT__="); // chart data inlined
    expect(html).toContain('id="fig-equity"');
    expect(html).toContain('id="fig-drawdown"');
    expect(html).toContain('id="fig-tradepnl"');
    expect(html).toContain("@font-face"); // fonts inlined
  });

  it("shows the interactivity note and a print-to-PDF button", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(html).toContain("Interactive report");
    expect(html).toContain("benchmark toggles above each chart");
    expect(html).toContain("Print / Save as PDF");
    expect(html).toContain("window.print()");
    // The button pre-sizes the charts via the print wrapper before printing, so
    // they fit the page and aren't truncated (and Safari doesn't blank the page).
    expect(html).toContain("__printReport");
  });

  it("renders every executive-summary KPI", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    for (const label of ["Total Return", "CAGR", "Sharpe Ratio", "Max Drawdown", "Win Rate", "Profit Factor"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("+42.50%"); // total return, signed
    expect(html).toContain("-12.70%"); // max drawdown
  });

  it("renders one toggle button per present benchmark, defaulting on", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(html).toContain('data-bench-btn="buy_and_hold"');
    expect(html).toContain('data-bench-btn="sp500"');
    // both default to ON in the global toggle state
    expect(html).toContain('"buy_and_hold":true');
    expect(html).toContain('"sp500":true');
  });

  it("omits the button (and section) for an absent benchmark", () => {
    const payload = mkPayload({ benchmarks: [mkBenchmark("buy_and_hold", "Buy & Hold", 10_000)] });
    const { html } = buildReportHtml(payload, PLOTLY_STUB);
    expect(html).toContain('data-bench-btn="buy_and_hold"');
    expect(html).not.toContain('data-bench-btn="sp500"');
  });

  it("drops the comparison table when there are no benchmarks", () => {
    const withBench = buildReportHtml(mkPayload(), PLOTLY_STUB).html;
    const noBench = buildReportHtml(mkPayload({ benchmarks: [] }), PLOTLY_STUB).html;
    expect(withBench).toContain("Strategy vs. Benchmarks");
    expect(noBench).not.toContain("Strategy vs. Benchmarks");
  });

  it("HTML-escapes dynamic strings so injected markup cannot break out", () => {
    const run = mkRun({ strategy_name: "Evil <script>alert(1)</script>" });
    const { html } = buildReportHtml(mkPayload({ run }), PLOTLY_STUB);
    expect(html).toContain("Evil &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("Evil <script>alert(1)");
  });

  it("notes demo mode when the report came from the NullProvider", () => {
    const { html } = buildReportHtml(mkPayload({ report: mkReport({ demo_mode: true }) }), PLOTLY_STUB);
    expect(html).toContain("Demo mode");
  });

  it("falls back to a 'no trades' note when the run has no trades", () => {
    const { html } = buildReportHtml(mkPayload({ trades: [] }), PLOTLY_STUB);
    expect(html).toContain("No trades were executed");
    expect(html).not.toContain('id="fig-tradepnl"');
  });

  // ---- New-tab / Save HTML (interactive mode) --------------------------------
  it("interactive mode adds a 'Save HTML File' action and embeds the filename", () => {
    const { html, filename } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(html).toContain("Save HTML File");
    expect(html).toContain("__saveReportHtml");
    // The filename is embedded so the in-report Save button names the download.
    expect(extractReportData(html).filename).toBe(filename);
  });

  it("embeds the readiness sentinel the PDF renderer waits on", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(html).toContain("__REPORT_READY__");
  });

  // ---- PDF mode --------------------------------------------------------------
  it("pdf mode drops the interactive controls and shows a static legend instead", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB, "pdf");
    // No actual toggle buttons (the runtime's selector string doesn't count).
    expect(html).not.toContain('data-bench-btn="buy_and_hold"');
    expect(html).not.toContain('data-bench-btn="sp500"');
    expect(html).not.toContain('class="savebtn"'); // no Save HTML button
    expect(html).not.toContain('class="printbtn"'); // no Print button
    expect(html).not.toContain("Interactive report"); // banner dropped
    expect(html).toContain('class="togbar"'); // static legend still present
    // Benchmarks remain active (rendered) at generation time.
    expect(extractReportData(html).toggles).toEqual({ buy_and_hold: true, sp500: true });
  });

  // ---- Drawdown sign (Part 3) ------------------------------------------------
  it("renders the drawdown underwater (≤ 0) for the strategy and each benchmark", () => {
    // Equity dips from a peak, so the computed underwater curve must go negative —
    // regardless of the (deliberately wrong) drawdown_pct on the points.
    const dip = (base: number): EquityPoint[] =>
      [100, 120, 90, 110].map((v, i) => ({
        ts: `2021-0${i + 1}-15T12:00:00Z`,
        equity: (v / 100) * base,
        cash: 0,
        position_value: 0,
        drawdown_pct: 999, // ignored — the report computes its own underwater curve
      }));
    const payload = mkPayload({
      equity: dip(10_000),
      benchmarks: [
        { kind: "buy_and_hold", label: "Buy & Hold", color: "#2563eb", equity: dip(5_000), metrics: mkMetrics() },
      ],
    });
    const fig = extractReportData(buildReportHtml(payload, PLOTLY_STUB).html).figures.find(
      (f) => f.id === "fig-drawdown",
    )!;
    const stratY = fig.data[0].y ?? [];
    expect(Math.min(...stratY)).toBeLessThan(0); // there is a real drawdown
    expect(Math.max(...stratY)).toBeLessThanOrEqual(0); // never above the zero line
    // The benchmark drawdown trace is present and genuinely underwater (not ~0).
    expect(fig.data.length).toBe(2);
    expect(Math.min(...(fig.data[1].y ?? []))).toBeLessThan(-1);
  });

  // ---- Heatmap parity (Part 4) -----------------------------------------------
  it("renders heatmap cells from within-month returns, matching the Results page", () => {
    const equity: EquityPoint[] = [
      { ts: "2020-01-10T12:00:00Z", equity: 100, cash: 0, position_value: 0, drawdown_pct: 0 },
      { ts: "2020-01-20T12:00:00Z", equity: 110, cash: 0, position_value: 0, drawdown_pct: 0 }, // +10.0
      { ts: "2020-02-10T12:00:00Z", equity: 110, cash: 0, position_value: 0, drawdown_pct: 0 },
      { ts: "2020-02-20T12:00:00Z", equity: 99, cash: 0, position_value: 0, drawdown_pct: 0 }, // -10.0
    ];
    const { html } = buildReportHtml(mkPayload({ equity, benchmarks: [] }), PLOTLY_STUB);
    expect(html).toContain(">+10.0<"); // Jan within-month return
    expect(html).toContain(">-10.0<"); // Feb within-month return
    expect(html).toContain(">-1.0<"); // annual: 100 → 99
  });

  // ---- PDF section toggles ---------------------------------------------------
  it("includes every section by default", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB, "pdf");
    for (const id of ['id="fig-equity"', 'id="fig-drawdown"', 'id="fig-tradepnl"']) {
      expect(html).toContain(id);
    }
    expect(html).toContain("Monthly Return Heatmap");
    expect(html).toContain("Run Parameters");
  });

  it("drops unchecked sections and their inlined figures", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB, "pdf", {
      drawdown: false,
      trades: false,
      commentary: false,
    });
    // Dropped sections + their figures are gone…
    expect(html).not.toContain('id="fig-drawdown"');
    expect(html).not.toContain('id="fig-tradepnl"');
    expect(html).not.toContain("AI Analysis");
    // …but kept sections (and figures) remain.
    expect(html).toContain('id="fig-equity"');
    expect(html).toContain("Monthly Return Heatmap");

    const data = extractReportData(html);
    expect(data.figures.find((f) => f.id === "fig-drawdown")).toBeUndefined();
    expect(data.figures.find((f) => f.id === "fig-tradepnl")).toBeUndefined();
    expect(data.figures.find((f) => f.id === "fig-equity")).toBeDefined();
  });

  // ---- Live "Sections" bar (interactive report) ------------------------------
  it("interactive mode adds a live Sections bar and wraps each toggleable section", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB);
    expect(html).toContain('class="sectionbar"');
    expect(html).toContain('data-section-btn="drawdown"'); // a toggle pill
    expect(html).toContain('data-section="drawdown"'); // the wrapped, hideable section
    expect(html).toContain('data-section="equity"');
  });

  it("pdf mode has no live Sections bar (the picker already chose)", () => {
    const { html } = buildReportHtml(mkPayload(), PLOTLY_STUB, "pdf");
    expect(html).not.toContain('class="sectionbar"');
    expect(html).not.toContain('data-section-btn="drawdown"');
  });
});
