import type { Metrics } from "@/api/client";

type MetricDef = {
  key: string;
  label: string;
  group: keyof Metrics;
  sub: string;
  format: (v: number) => string;
  color: (v: number) => string;
};

const neutral = () => "text-ink-primary";
const signedColor = (v: number) => v >= 0 ? "text-accent-green" : "text-accent-red";
const alwaysGreen = () => "text-accent-green";
const alwaysRed   = () => "text-accent-red";
const threshColor = (lo: number, hi: number) =>
  (v: number) => v >= hi ? "text-accent-green" : v >= lo ? "text-accent-amber" : "text-accent-red";

const METRICS: MetricDef[] = [
  // Row 1
  { key: "cagr_pct",         label: "CAGR",          group: "return", sub: "Ann. return",     format: pct,  color: signedColor },
  { key: "max_drawdown_pct", label: "Max Drawdown",   group: "risk",   sub: "Peak to trough", format: pct,  color: alwaysRed },
  { key: "sharpe_ratio",     label: "Sharpe Ratio",   group: "risk",   sub: "Risk-adj. return", format: n2, color: threshColor(0.5, 1) },
  { key: "sortino_ratio",    label: "Sortino Ratio",  group: "risk",   sub: "Downside-adj.",  format: n2,   color: threshColor(0.8, 1.2) },
  { key: "calmar_ratio",     label: "Calmar Ratio",   group: "risk",   sub: "CAGR / MaxDD",   format: n2,   color: threshColor(0.5, 1) },
  // Row 2
  { key: "total_return_pct", label: "Total Return",   group: "return", sub: "Full period",    format: pct,  color: signedColor },
  { key: "win_rate_pct",     label: "Win Rate",       group: "trade",  sub: "Trades won",     format: pct,  color: threshColor(40, 55) },
  { key: "profit_factor",    label: "Profit Factor",  group: "trade",  sub: "Gross P / Gross L", format: n2, color: threshColor(1, 1.5) },
  { key: "avg_win_loss",     label: "Avg Win/Loss",   group: "trade",  sub: "Payoff ratio",   format: (v) => `${n2(v)}x`, color: alwaysGreen },
  { key: "total_trades",     label: "Total Trades",   group: "trade",  sub: "Executions",     format: (v) => Math.round(v).toString(), color: neutral },
];

export function MetricsPanel({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid bg-surface" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          {METRICS.map((m) => (
            <MetricCard key={m.key} label={m.label} value="—" sub={m.sub} valueClass="text-ink-muted" border />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* 2 rows of 5 columns, flush grid with dividers */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {METRICS.map((m, i) => {
          const raw   = metrics[m.group]?.[m.key];
          const value = raw === undefined ? "—" : m.format(raw);
          const vClass = raw === undefined ? "text-ink-muted" : m.color(raw);
          const isLastRow = i >= 5;
          return (
            <MetricCard
              key={m.key}
              label={m.label}
              value={value}
              sub={m.sub}
              valueClass={vClass}
              border={i % 5 !== 4}          // right border except last col
              topBorder={isLastRow}          // top border for row 2
            />
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({
  label, value, sub, valueClass, border, topBorder,
}: {
  label: string; value: string; sub: string;
  valueClass: string; border?: boolean; topBorder?: boolean;
}) {
  return (
    <div
      className={`bg-surface px-4 py-4
        ${border    ? "border-r border-border" : ""}
        ${topBorder ? "border-t border-border" : ""}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted mb-2">
        {label}
      </div>
      <div className={`font-mono text-[22px] font-bold leading-none ${valueClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink-muted mt-1.5">{sub}</div>
    </div>
  );
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function n2(v: number) {
  if (!isFinite(v)) return "inf";
  return v.toFixed(2);
}
