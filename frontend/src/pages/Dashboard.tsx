import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Api, type BacktestSummary } from "@/api/client";

/**
 * Dashboard — list of past runs, status badges, link to results. The page
 * polls every 5s if there are runs in `running` state.
 */
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
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Backtest runs</h1>
        <Link to="/backtests/new" className="btn-primary">
          + New backtest
        </Link>
      </div>

      {error && (
        <div className="card text-accent-red">
          Could not reach the backend: {error}. Is uvicorn running on :8000?
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Strategy</th>
              <th className="py-2 pr-4">Asset</th>
              <th className="py-2 pr-4">Range</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-mono">{r.id}</td>
                <td className="py-2 pr-4">{r.strategy_id}</td>
                <td className="py-2 pr-4">{r.asset_id}</td>
                <td className="py-2 pr-4 text-xs">
                  {r.start_date.slice(0, 10)} → {r.end_date.slice(0, 10)}
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 pr-4 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  <Link to={`/backtests/${r.id}`} className="btn-ghost">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {runs.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No runs yet. Click <Link to="/backtests/new" className="underline">+ New backtest</Link> to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-800",
    running: "bg-amber-100 text-amber-800",
    pending: "bg-slate-100 text-slate-700",
    failed: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${palette[status] ?? "bg-slate-100"}`}>
      {status}
    </span>
  );
}
