import type { CSSProperties } from "react";

import type { EquityPoint } from "@/api/client";
import { type BenchmarkSeries, STRATEGY } from "./benchmarks";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function cellBg(v: number | null): string {
  if (v === null) return "transparent";
  const alpha = (Math.min(Math.abs(v) / 10, 1) * 0.85 + 0.10).toFixed(2);
  return v >= 0
    ? `rgba(63, 185, 80, ${alpha})`
    : `rgba(248, 81, 73, ${alpha})`;
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

function computeReturns(data: EquityPoint[]) {
  const monthly: Record<number, Record<number, { first: number; last: number }>> = {};
  for (const pt of data) {
    const d = new Date(pt.ts);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!monthly[y]) monthly[y] = {};
    if (!monthly[y][m]) {
      monthly[y][m] = { first: pt.equity, last: pt.equity };
    } else {
      monthly[y][m].last = pt.equity;
    }
  }

  const years = Object.keys(monthly).map(Number).sort();
  const annual: Record<number, number | null> = {};
  for (const y of years) {
    const pts = data.filter((pt) => new Date(pt.ts).getFullYear() === y);
    annual[y] = pts.length >= 2
      ? (pts[pts.length - 1].equity / pts[0].equity - 1) * 100
      : null;
  }

  const returns: Record<number, Record<number, number | null>> = {};
  for (const y of years) {
    returns[y] = {};
    for (let m = 1; m <= 12; m++) {
      const cell = monthly[y]?.[m];
      returns[y][m] = cell ? (cell.last / cell.first - 1) * 100 : null;
    }
  }

  return { years, returns, annual };
}

const thStyle: CSSProperties = {
  padding: "4px 8px",
  textAlign: "center",
  color: "#7d8590",
  fontWeight: 400,
  borderBottom: "1px solid #21262d",
};

const tdStyle: CSSProperties = {
  padding: "3px 6px",
  textAlign: "center",
  minWidth: 46,
  borderRadius: 3,
};

/** Empty spacer cell style — creates a visible void between Dec and Ann. */
const spacerThStyle: CSSProperties = {
  width: 12,
  padding: 0,
  background: "transparent",
  borderBottom: "1px solid #21262d",
};
const spacerTdStyle: CSSProperties = {
  width: 12,
  padding: 0,
  background: "transparent",
};

/** The year × 12-month returns grid for one equity series. */
function HeatmapTable({ equity }: { equity: EquityPoint[] }) {
  const { years, returns, annual } = computeReturns(equity);
  return (
    <table style={{ borderCollapse: "collapse", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#c9d1d9", width: "100%" }}>
      <thead>
        <tr>
          <th style={thStyle} />
          {MONTH_LABELS.map((m) => (
            <th key={m} style={thStyle}>{m}</th>
          ))}
          <th style={spacerThStyle} />
          <th style={{ ...thStyle, color: "#7d8590" }}>Ann.</th>
        </tr>
      </thead>
      <tbody>
        {years.map((y) => (
          <tr key={y}>
            <td style={{ ...tdStyle, color: "#7d8590", textAlign: "left", paddingLeft: 6 }}>{y}</td>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => {
              const v = returns[y][m] ?? null;
              return (
                <td
                  key={m}
                  style={{ ...tdStyle, background: cellBg(v), color: v === null ? "#30363d" : "#e6edf3" }}
                >
                  {fmt(v)}
                </td>
              );
            })}
            <td style={spacerTdStyle} />
            <td style={{ ...tdStyle, background: cellBg(annual[y] ?? null), color: "#e6edf3", fontWeight: 700 }}>
              {fmt(annual[y] ?? null)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Per-series box border + faint background tint (token-based, static classes).
const BOX_CLASS: Record<string, string> = {
  strategy:     "border-accent-cyan/40 bg-accent-cyan/[0.02]",
  buy_and_hold: "border-accent-blue/40 bg-accent-blue/[0.02]",
  sp500:        "border-accent-pink/40 bg-accent-pink/[0.02]",
};

export function MonthlyHeatmap({
  equityData,
  benchmarks = [],
}: {
  equityData: EquityPoint[] | null;
  benchmarks?: BenchmarkSeries[];
}) {
  if (!equityData || equityData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono">
        No equity data yet.
      </div>
    );
  }

  // No benchmarks → the original single table, unchanged.
  if (benchmarks.length === 0) {
    return (
      <div className="overflow-x-auto px-5 py-4" style={{ background: "#0d1117" }}>
        <HeatmapTable equity={equityData} />
      </div>
    );
  }

  // ≥1 benchmark → one labelled, bordered box per series (Strategy first).
  const series = [
    { id: "strategy", tag: STRATEGY.tag, tagClass: STRATEGY.tagClass, label: STRATEGY.label, equity: equityData },
    ...benchmarks.map((b) => ({ id: b.kind, tag: b.tag, tagClass: b.tagClass, label: b.label, equity: b.equity })),
  ];

  return (
    <div className="px-5 py-4 space-y-3" style={{ background: "#0d1117" }}>
      {series.map((s) => (
        <div key={s.id} className={`rounded-lg border-2 p-3 ${BOX_CLASS[s.id] ?? ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-mono text-[9px] tracking-wider px-1.5 py-[2px] rounded-sm border ${s.tagClass}`}>
              {s.tag}
            </span>
            <span className="text-[12px] text-ink-primary font-medium">{s.label}</span>
          </div>
          <div className="overflow-x-auto">
            <HeatmapTable equity={s.equity} />
          </div>
        </div>
      ))}
    </div>
  );
}
