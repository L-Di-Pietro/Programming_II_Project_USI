import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Api, type BacktestSummary } from "@/api/client";
import { formatLocal } from "@/utils/datetime";

// ── Max lookback descriptors (text rather than a single big number) ─────────
const LOOKBACK_LIMITS = [
  { tf: "Daily",  text: "Max yfinance Limit (Full History)" },
  { tf: "Hourly", text: "Max yfinance Limit (729 Days)" },
];

// Shared grid template for the Recent Backtests table. minmax(0, …fr) prevents
// columns from auto-growing past their fr-share when content (e.g. timestamps)
// is wider than the available space — otherwise header and rows desync.
const RUNS_GRID_COLUMNS =
  "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.6fr) 90px";
const RUNS_HEADERS = ["Strategy", "Asset", "Period", "Status", "Created", ""];

// ── Component ─────────────────────────────────────────────────────────────────
export function Dashboard() {
  const [runs, setRuns] = useState<BacktestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [strategyCount, setStrategyCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const data = await Api.listBacktests();
        if (!active) return;
        setRuns(data);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(String(e));
      }
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let active = true;
    Api.listStrategies()
      .then((s) => { if (active) setStrategyCount(s.length); })
      .catch(() => { /* fall back to a dash; not worth surfacing here */ });
    return () => { active = false; };
  }, []);

  const topStats: { val: string; label: string; small?: boolean }[] = [
    { val: strategyCount === null ? "…" : String(strategyCount), label: "Strategies Available" },
    { val: "4",       label: "Asset Classes" },
    { val: "1D / 1H", label: "Data Interval", small: true },
  ];

  return (
    <div className="pb-16">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="flex gap-10 px-10 pt-12 pb-10 items-start flex-wrap">
        <div className="flex-1 min-w-[320px]">
          {/* Badge */}
          <div className="inline-block border border-accent-cyan text-accent-cyan
                          font-mono text-[10px] tracking-[2px] px-2.5 py-1 rounded-sm mb-5">
            QUANTEDGE PLATFORM v2.1
          </div>
          <h1 className="text-4xl font-bold leading-tight text-ink-primary mb-4">
            Backtest Before<br />
            <span className="text-accent-cyan">You Risk Capital.</span>
          </h1>
          <p className="text-ink-muted text-[19px] leading-relaxed max-w-[500px]">
            A professional-grade backtesting engine for retail quant traders. Test strategies
            across equities, FX and crypto — stress-test with commissions, slippage, and
            AI-powered insights.
          </p>
          <div className="flex gap-3 mt-8">
            <Link to="/strategies" className="btn-primary text-lg px-7 py-3.5 rounded-lg">
              Select Strategy
            </Link>
            <Link to="/backtests/new" className="btn-secondary text-lg px-7 py-3.5 rounded-lg">
              Configure Run
            </Link>
          </div>
        </div>

        {/* Stat box. Width tracks the ~20% content scale-up so the widest
            value ("1D / 1H") keeps its room; structure/columns/colors unchanged. */}
        <div className="flex-shrink-0 w-[548px] border border-border-subtle rounded-lg overflow-hidden">
          {/* Top row — three small stat cells. Fixed-height value area keeps
              labels aligned across boxes even when one value is smaller. */}
          <div className="grid grid-cols-3">
            {topStats.map((s, i) => (
              <div
                key={s.label}
                className={`bg-base px-4 py-7 flex flex-col items-center justify-center text-center border-b border-border
                  ${i < 2 ? "border-r border-border" : ""}`}
              >
                <div className="h-[52px] flex items-center justify-center">
                  <span
                    className={`font-mono font-bold text-accent-cyan whitespace-nowrap ${
                      s.small ? "text-[34px]" : "text-[44px]"
                    }`}
                  >
                    {s.val}
                  </span>
                </div>
                <div className="text-[#F5F5F0] text-[17px] mt-2">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Bottom row — full-width Max Lookback box.
              Label sits ABOVE the two timeframe lines. */}
          <div className="bg-base px-7 py-7 text-center">
            <div className="text-[#F5F5F0] text-[17px] mb-3">Max Lookback</div>
            <div className="flex flex-col gap-2.5">
              {LOOKBACK_LIMITS.map((l) => (
                <div key={l.tf} className="text-[19px] leading-snug">
                  <span className="font-mono text-accent-cyan">{l.tf}:</span>{" "}
                  <span className="text-ink-muted">{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Backtests label ─────────────────────────────────── */}
      <div className="px-10 pb-3 border-b border-border">
        <span className="font-mono text-[11px] tracking-[2px] text-accent-cyan">
          RECENT BACKTESTS
        </span>
      </div>

      {error && (
        <div className="mx-10 mt-4 card border-accent-red text-accent-red text-sm">
          Could not reach backend: {error}. Is uvicorn running on :8000?
        </div>
      )}

      {/* ── Runs table ────────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        {/* Table header */}
        <div className="grid gap-0 border-b border-border px-10 py-2.5"
          style={{ gridTemplateColumns: RUNS_GRID_COLUMNS }}>
          {RUNS_HEADERS.map((h, i) => (
            <div key={i} className="font-mono text-[10px] uppercase tracking-widest text-ink-muted min-w-0 text-center">
              {h}
            </div>
          ))}
        </div>

        {runs.length === 0 && !error && (
          <div className="px-10 py-12 text-center text-ink-muted text-sm">
            No runs yet.{" "}
            <Link to="/backtests/new" className="text-accent-cyan underline underline-offset-2">
              Configure a backtest
            </Link>{" "}
            to get started.
          </div>
        )}

        {runs.map((r) => (
          <div
            key={r.id}
            className="grid border-b border-border px-10 py-3.5 hover:bg-white/[0.02] transition-colors cursor-default"
            style={{ gridTemplateColumns: RUNS_GRID_COLUMNS }}
          >
            <div className="text-ink-primary text-sm font-medium flex items-center justify-center min-w-0 truncate text-center">
              {r.strategy_name}
            </div>
            <div className="font-mono text-[12px] text-ink-muted flex items-center justify-center min-w-0 truncate text-center">
              {r.asset_symbol}
            </div>
            <div className="font-mono text-[11px] text-ink-muted flex items-center justify-center min-w-0 truncate text-center">
              {r.start_date.slice(0, 10)} &ndash; {r.end_date.slice(0, 10)}
            </div>
            <div className="flex items-center justify-center min-w-0">
              <StatusPill status={r.status} />
            </div>
            <div className="text-[11px] text-ink-muted flex items-center justify-center min-w-0 truncate text-center">
              {formatLocal(r.created_at)}
            </div>
            <div className="flex items-center justify-end">
              <Link to={`/backtests/${r.id}`} className="btn-ghost text-xs">
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "text-accent-green  border-accent-green/40  bg-accent-green/10",
    running:   "text-accent-amber  border-accent-amber/40  bg-accent-amber/10",
    pending:   "text-ink-muted     border-border           bg-surface",
    failed:    "text-accent-red    border-accent-red/40    bg-accent-red/10",
  };
  return (
    <span
      className={`font-mono text-[10px] font-bold uppercase tracking-wider
                  px-2 py-0.5 rounded border ${styles[status] ?? "text-ink-muted border-border"}`}
    >
      {status}
    </span>
  );
}
