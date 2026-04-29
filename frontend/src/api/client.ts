// Typed API client — wraps Axios with TypeScript types that mirror the
// backend's Pydantic schemas. Run `npm run gen:types` against a running
// backend to regenerate `openapi-types.ts` from the live OpenAPI schema.

import axios from "axios";

// In dev, vite proxies /api/* → backend. In prod, set VITE_API_URL.
const baseURL = import.meta.env.VITE_API_URL ?? "/api";
export const api = axios.create({ baseURL, timeout: 60_000 });

// -----------------------------------------------------------------------------
// Hand-rolled types — kept in sync with backend/api/schemas.py.
// (Switch to generated openapi-types.ts once the backend is running.)
// -----------------------------------------------------------------------------
export interface Asset {
  id: number;
  symbol: string;
  asset_class: string;
  name: string;
  exchange: string;
  currency: string;
  is_active: boolean;
}

export interface Strategy {
  slug: string;
  name: string;
  description: string;
  params_schema: Record<string, unknown>;
}

export interface BacktestSummary {
  id: number;
  strategy_id: number;
  asset_id: number;
  timeframe: string;
  start_date: string;
  end_date: string;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
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
  allow_fractional?: boolean;
  max_dd_pct?: number | null;
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
  async refreshAsset(symbol: string) {
    const { data } = await api.post(`/assets/${encodeURIComponent(symbol)}/refresh`);
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
    const { data } = await api.get<BacktestSummary>(`/backtests/${runId}`);
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
  async getChart(runId: number, kind: "equity" | "drawdown" | "heatmap") {
    const { data } = await api.get<PlotlyFigure>(`/backtests/${runId}/charts/${kind}`);
    return data;
  },

  // Explain ------------------------------------------------------------------
  async explain(req: ExplainRequest) {
    const { data } = await api.post<ExplainResponse>("/explain", req);
    return data;
  },
};
