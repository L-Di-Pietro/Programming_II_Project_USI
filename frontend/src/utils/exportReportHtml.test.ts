import { describe, expect, it } from "vitest";

import type { Asset, BacktestDetail, EquityPoint, Metrics, Report, Trade } from "@/api/client";
import { buildReportHtml, type ReportBenchmark, type ReportPayload } from "./exportReportHtml";

const PLOTLY_STUB = "/*__PLOTLY_STUB__*/";

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
});
