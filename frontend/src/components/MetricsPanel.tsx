import type { Metrics } from "@/api/client";

import { STRATEGY } from "./benchmarks";

type MetricDef = {
  key: string;
  label: string;
  group: keyof Metrics;
  sub: string;
  format: (v: number) => string;
  color: (v: number) => string;
  /** Trade-only metric: benchmarks don't trade, so their cell shows "—". */
  benchmarkBlank?: boolean;
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
  { key: "win_rate_pct",     label: "Win Rate",       group: "trade",  sub: "Trades won",     format: pct,  color: threshColor(40, 55), benchmarkBlank: true },
  { key: "profit_factor",    label: "Profit Factor",  group: "trade",  sub: "Gross P / Gross L", format: n2, color: threshColor(1, 1.5), benchmarkBlank: true },
  { key: "avg_win_loss",     label: "Avg Win/Loss",   group: "trade",  sub: "Payoff ratio",   format: (v) => `${n2(v)}x`, color: alwaysGreen, benchmarkBlank: true },
  { key: "total_trades",     label: "Total Trades",   group: "trade",  sub: "Executions",     format: (v) => Math.round(v).toString(), color: neutral },
];

/** One stacked value line inside a metric card. */
type Row = { tag: string; tagClass: string; value: string; valueClass: string };

/** A benchmark series' metrics plus its identifier-pill styling. */
export interface BenchmarkMetricSeries {
  kind: string;
  tag: string;
  tagClass: string;
  metrics: Metrics;
}

function cellFor(m: MetricDef, src: Metrics): { value: string; valueClass: string } {
  const raw = src[m.group]?.[m.key];
  return raw === undefined
    ? { value: "—", valueClass: "text-ink-muted" }
    : { value: m.format(raw), valueClass: m.color(raw) };
}

export function MetricsPanel({
  metrics,
  benchmarks = [],
}: {
  metrics: Metrics | null;
  benchmarks?: BenchmarkMetricSeries[];
}) {
  if (!metrics) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid bg-surface" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          {METRICS.map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              sub={m.sub}
              rows={[{ tag: STRATEGY.tag, tagClass: STRATEGY.tagClass, value: "—", valueClass: "text-ink-muted" }]}
              stacked={false}
              border
            />
          ))}
        </div>
      </div>
    );
  }

  const stacked = benchmarks.length > 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* 2 rows of 5 columns, flush grid with dividers */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {METRICS.map((m, i) => {
          // Strategy row, then one row per active benchmark. Each row is
          // coloured by its own value (independent thresholds).
          const rows: Row[] = [
            { tag: STRATEGY.tag, tagClass: STRATEGY.tagClass, ...cellFor(m, metrics) },
          ];
          for (const b of benchmarks) {
            rows.push(
              m.benchmarkBlank
                ? { tag: b.tag, tagClass: b.tagClass, value: "—", valueClass: "text-ink-muted" }
                : { tag: b.tag, tagClass: b.tagClass, ...cellFor(m, b.metrics) },
            );
          }
          return (
            <MetricCard
              key={m.key}
              label={m.label}
              sub={m.sub}
              rows={rows}
              stacked={stacked}
              border={i % 5 !== 4}          // right border except last col
              topBorder={i >= 5}             // top border for row 2
            />
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({
  label, sub, rows, stacked, border, topBorder,
}: {
  label: string; sub: string; rows: Row[]; stacked: boolean;
  border?: boolean; topBorder?: boolean;
}) {
  return (
    <div
      className={`bg-surface px-4 ${stacked ? "py-5" : "py-4"}
        ${border    ? "border-r border-border" : ""}
        ${topBorder ? "border-t border-border" : ""}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted mb-2">
        {label}
      </div>
      {stacked ? (
        <div className="space-y-2">
          {rows.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span
                className={`font-mono text-[9px] tracking-wider px-1.5 py-[2px] rounded-sm border ${r.tagClass}`}
              >
                {r.tag}
              </span>
              <span className={`font-mono text-[22px] font-bold leading-none tabular-nums ${r.valueClass}`}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`font-mono text-[22px] font-bold leading-none ${rows[0].valueClass}`}>
          {rows[0].value}
        </div>
      )}
      <div className={`text-[11px] text-ink-muted ${stacked ? "mt-3" : "mt-1.5"}`}>{sub}</div>
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
