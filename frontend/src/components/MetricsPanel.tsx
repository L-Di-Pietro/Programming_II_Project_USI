import type { Metrics } from "@/api/client";

/**
 * KPI grid. Coloured tiles for the headline numbers; secondary metrics in
 * a denser table. Names map to backend metric_name keys.
 */
export function MetricsPanel({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) {
    return <div className="card text-slate-400 text-sm">Metrics not available yet.</div>;
  }
  const headline: { key: string; label: string; group: keyof Metrics; format: (v: number) => string }[] = [
    { key: "cagr_pct", label: "CAGR", group: "return", format: pct },
    { key: "sharpe_ratio", label: "Sharpe", group: "risk", format: n2 },
    { key: "sortino_ratio", label: "Sortino", group: "risk", format: n2 },
    { key: "calmar_ratio", label: "Calmar", group: "risk", format: n2 },
    { key: "max_drawdown_pct", label: "Max DD", group: "risk", format: pct },
    { key: "win_rate_pct", label: "Win rate", group: "trade", format: pct },
    { key: "profit_factor", label: "Profit factor", group: "trade", format: n2 },
    { key: "total_trades", label: "# Trades", group: "trade", format: (v) => Math.round(v).toString() },
  ];

  return (
    <div className="card">
      <h2 className="mb-3">Key Performance Indicators</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {headline.map(({ key, label, group, format }) => {
          const value = metrics[group]?.[key];
          return (
            <div key={key} className="rounded-md border border-slate-200 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="text-lg font-semibold mt-1">
                {value === undefined ? "—" : format(value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pct(v: number) {
  return `${v.toFixed(2)} %`;
}
function n2(v: number) {
  if (!isFinite(v)) return "∞";
  return v.toFixed(2);
}
