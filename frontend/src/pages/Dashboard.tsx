import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Api, type BacktestSummary } from "@/api/client";

// ── Static platform stats ────────────────────────────────────────────────────
const PLATFORM_STATS = [
  { val: "4",  label: "Strategies Available" },
  { val: "3",  label: "Asset Classes" },
  { val: "10Y", label: "Max Lookback" },
  { val: "1D",  label: "Data Interval" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function Dashboard() {
  const [runs, setRuns] = useState<BacktestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          <p className="text-ink-muted text-[15px] leading-relaxed max-w-[500px]">
            A professional-grade backtesting engine for retail quant traders. Test strategies
            across equities, FX and crypto — stress-test with commissions, slippage, and
            AI-powered insights.
          </p>
          <div className="flex gap-3 mt-8">
            <Link to="/strategies" className="btn-primary">
              Select Strategy
            </Link>
            <Link to="/backtests/new" className="btn-secondary">
              Configure Run
            </Link>
          </div>
        </div>

        {/* Stat box */}
        <div className="flex-shrink-0 w-[280px] border border-border-subtle rounded-lg overflow-hidden">
          <div className="grid grid-cols-2">
            {PLATFORM_STATS.map((s, i) => (
              <div
                key={s.label}
                className={`bg-base px-5 py-5 text-center
                  ${i % 2 === 0 ? "border-r border-border" : ""}
                  ${i < 2 ? "border-b border-border" : ""}`}
              >
                <div className="font-mono text-3xl font-bold text-accent-cyan">{s.val}</div>
                <div className="text-ink-muted text-xs mt-1">{s.label}</div>
              </div>
            ))}
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
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
          {["Strategy", "Asset", "Period", "Status", "Created", "", ""].map((h) => (
            <div key={h} className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
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
            style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}
          >
            <div className="text-ink-primary text-sm font-medium flex items-center">
              {r.strategy_name}
            </div>
            <div className="font-mono text-[12px] text-ink-muted flex items-center">
              {r.asset_symbol}
            </div>
            <div className="font-mono text-[11px] text-ink-muted flex items-center">
              {r.start_date.slice(0, 10)} &ndash; {r.end_date.slice(0, 10)}
            </div>
            <div className="flex items-center">
              <StatusPill status={r.status} />
            </div>
            <div className="text-[11px] text-ink-muted flex items-center">
              {new Date(r.created_at).toLocaleString()}
            </div>
            <div />
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
