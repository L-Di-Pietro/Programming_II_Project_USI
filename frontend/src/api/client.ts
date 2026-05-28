// Typed API client — wraps Axios with TypeScript types that mirror the
// backend's Pydantic schemas. Run `npm run gen:types` against a running
// backend to regenerate `openapi-types.ts` from the live OpenAPI schema.

import axios, { AxiosError } from "axios";

// In dev, vite proxies /api/* → backend. In prod, set VITE_API_URL.
const baseURL = import.meta.env.VITE_API_URL ?? "/api";
export const api = axios.create({ baseURL, timeout: 60_000 });

// Report generation makes a live LLM call (slow, plus retries on model overload),
// so it needs a far longer ceiling than the 60 s default applied to every other call.
const REPORT_GEN_TIMEOUT_MS = 180_000;

// -----------------------------------------------------------------------------
// Hand-rolled types — kept in sync with backend/api/schemas.py.
// (Switch to generated openapi-types.ts once the backend is running.)
// -----------------------------------------------------------------------------
export type Timeframe = "1d" | "1h";

/** Data coverage for one timeframe: overall bounds + RLE present-day ranges. */
export interface DateBounds {
  first: string;
  last: string;
  /** Inclusive [start, end] ISO runs of consecutive days that have a bar. */
  ranges: [string, string][];
}

export interface Asset {
  id: number;
  symbol: string;
  asset_class: string;
  name: string;
  exchange: string;
  currency: string;
  is_active: boolean;
  /** Per-timeframe data coverage ("1d"/"1h"); absent key = no bars for that tf. */
  coverage?: Record<string, DateBounds>;
}

export interface Strategy {
  slug: string;
  name: string;
  description: string;
  category: string;
  params_schema: Record<string, unknown>;
}

export interface BacktestSummary {
  id: number;
  strategy_id: number;
  strategy_name: string;
  asset_id: number;
  asset_symbol: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  has_report: boolean;
  report_generated_at: string | null;
}

/** Single-run detail — summary plus the strategy params the user chose. */
export interface BacktestDetail extends BacktestSummary {
  params: Record<string, unknown>;
}

export interface BacktestRequest {
  asset_symbol: string;
  strategy_slug: string;
  start_date: string;
  end_date: string;
  params?: Record<string, unknown>;
  initial_cash?: number;
  commission_bps?: number;
  slippage_bps?: number;
  risk_fraction?: number;
  sizing_mode?: "fixed_fraction" | "vol_target";
  max_dd_pct?: number | null;
  timeframe?: Timeframe;
}

export interface Trade {
  id: number;
  ts: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  commission: number;
  slippage_cost: number;
  gross_pnl: number;
  net_pnl: number;
}

export interface EquityPoint {
  ts: string;
  equity: number;
  cash: number;
  position_value: number;
  drawdown_pct: number;
}

export interface Metrics {
  return: Record<string, number>;
  risk: Record<string, number>;
  trade: Record<string, number>;
}

/** Benchmark overlays available on a run. Mirrors the backend's kind param. */
export type BenchmarkKind = "buy_and_hold" | "sp500";

export interface PlotlyFigure {
  figure: { data: unknown[]; layout: Record<string, unknown> };
}

export interface ExplainRequest {
  op: "explain_metric" | "explain_strategy" | "compare_runs" | "answer_question";
  run_id?: number;
  other_run_id?: number;
  metric_name?: string;
  strategy_slug?: string;
  user_question?: string;
}

export interface ExplainResponse {
  op: string;
  text: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  demo_mode: boolean;
}

export interface Report {
  text: string;
  model: string;
  demo_mode: boolean;
  generated_at: string;
  cached: boolean;
  prompt_tokens: number;
  completion_tokens: number;
}

// -----------------------------------------------------------------------------
// Endpoint helpers — keep in sync with backend routers.
// -----------------------------------------------------------------------------
export const Api = {
  // Health -------------------------------------------------------------------
  async health() {
    const { data } = await api.get<{
      status: string;
      llm_enabled: boolean;
      llm_provider: string;
    }>("/healthz");
    return data;
  },

  // Assets -------------------------------------------------------------------
  async listAssets() {
    const { data } = await api.get<Asset[]>("/assets");
    return data;
  },
  async refreshAsset(symbol: string, timeframe: Timeframe = "1d") {
    const { data } = await api.post(
      `/assets/${encodeURIComponent(symbol)}/refresh`,
      null,
      { params: { timeframe } },
    );
    return data;
  },

  // Strategies ---------------------------------------------------------------
  async listStrategies() {
    const { data } = await api.get<Strategy[]>("/strategies");
    return data;
  },

  // Backtests ----------------------------------------------------------------
  async submitBacktest(req: BacktestRequest) {
    const { data } = await api.post<BacktestSummary>("/backtests", req);
    return data;
  },
  async listBacktests() {
    const { data } = await api.get<BacktestSummary[]>("/backtests");
    return data;
  },
  async getBacktest(runId: number) {
    const { data } = await api.get<BacktestDetail>(`/backtests/${runId}`);
    return data;
  },
  async getMetrics(runId: number) {
    const { data } = await api.get<Metrics>(`/backtests/${runId}/metrics`);
    return data;
  },
  async getEquity(runId: number) {
    const { data } = await api.get<EquityPoint[]>(`/backtests/${runId}/equity`);
    return data;
  },
  async getTrades(runId: number) {
    const { data } = await api.get<Trade[]>(`/backtests/${runId}/trades`);
    return data;
  },
  async getChart(
    runId: number,
    kind: "equity" | "drawdown" | "heatmap" | "trade_pnl" | "rolling_sharpe",
  ) {
    const { data } = await api.get<PlotlyFigure>(`/backtests/${runId}/charts/${kind}`);
    return data;
  },

  // Benchmark overlays (same shapes as getMetrics / getEquity, scoped to a run).
  async getBenchmarkMetrics(runId: number, kind: BenchmarkKind) {
    const { data } = await api.get<Metrics>(`/backtests/${runId}/benchmark/${kind}/metrics`);
    return data;
  },
  async getBenchmarkEquity(runId: number, kind: BenchmarkKind) {
    const { data } = await api.get<EquityPoint[]>(`/backtests/${runId}/benchmark/${kind}/equity`);
    return data;
  },

  // Explain ------------------------------------------------------------------
  async explain(req: ExplainRequest) {
    const { data } = await api.post<ExplainResponse>("/explain", req);
    return data;
  },

  // Report -------------------------------------------------------------------
  /** Returns the cached report, or null if none has been generated yet. */
  async getReport(runId: number): Promise<Report | null> {
    try {
      const { data } = await api.get<Report>(`/backtests/${runId}/report`);
      return data;
    } catch (e) {
      if (e instanceof AxiosError && e.response?.status === 404) {
        return null;
      }
      throw e;
    }
  },
  /** Triggers fresh LLM generation. Used for both initial generation and
   * 'Regenerate'. The new report becomes the latest cached one automatically. */
  async generateReport(runId: number): Promise<Report> {
    const { data } = await api.post<Report>(`/backtests/${runId}/report`, null, {
      timeout: REPORT_GEN_TIMEOUT_MS,
    });
    return data;
  },
  /** Browser-navigable URL for the styled PDF export of a run's report. */
  reportPdfUrl(runId: number): string {
    return `${baseURL}/backtests/${runId}/report.pdf`;
  },
};
