// Typed API client — wraps Axios with TypeScript types that mirror the
// backend's Pydantic schemas. Run `npm run gen:types` against a running
// backend to regenerate `openapi-types.ts` from the live OpenAPI schema.
import axios, { AxiosError } from "axios";
// In dev, vite proxies /api/* → backend. In prod, set VITE_API_URL.
const baseURL = import.meta.env.VITE_API_URL ?? "/api";
export const api = axios.create({ baseURL, timeout: 60_000 });
// -----------------------------------------------------------------------------
// Endpoint helpers — keep in sync with backend routers.
// -----------------------------------------------------------------------------
export const Api = {
    // Health -------------------------------------------------------------------
    async health() {
        const { data } = await api.get("/healthz");
        return data;
    },
    // Assets -------------------------------------------------------------------
    async listAssets() {
        const { data } = await api.get("/assets");
        return data;
    },
    async refreshAsset(symbol) {
        const { data } = await api.post(`/assets/${encodeURIComponent(symbol)}/refresh`);
        return data;
    },
    // Strategies ---------------------------------------------------------------
    async listStrategies() {
        const { data } = await api.get("/strategies");
        return data;
    },
    // Backtests ----------------------------------------------------------------
    async submitBacktest(req) {
        const { data } = await api.post("/backtests", req);
        return data;
    },
    async listBacktests() {
        const { data } = await api.get("/backtests");
        return data;
    },
    async getBacktest(runId) {
        const { data } = await api.get(`/backtests/${runId}`);
        return data;
    },
    async getMetrics(runId) {
        const { data } = await api.get(`/backtests/${runId}/metrics`);
        return data;
    },
    async getEquity(runId) {
        const { data } = await api.get(`/backtests/${runId}/equity`);
        return data;
    },
    async getTrades(runId) {
        const { data } = await api.get(`/backtests/${runId}/trades`);
        return data;
    },
    async getChart(runId, kind) {
        const { data } = await api.get(`/backtests/${runId}/charts/${kind}`);
        return data;
    },
    // Explain ------------------------------------------------------------------
    async explain(req) {
        const { data } = await api.post("/explain", req);
        return data;
    },
    // Report -------------------------------------------------------------------
    /** Returns the cached report, or null if none has been generated yet. */
    async getReport(runId) {
        try {
            const { data } = await api.get(`/backtests/${runId}/report`);
            return data;
        }
        catch (e) {
            if (e instanceof AxiosError && e.response?.status === 404) {
                return null;
            }
            throw e;
        }
    },
    /** Triggers fresh LLM generation. Used for both initial generation and
     * 'Regenerate'. The new report becomes the latest cached one automatically. */
    async generateReport(runId) {
        const { data } = await api.post(`/backtests/${runId}/report`);
        return data;
    },
};
