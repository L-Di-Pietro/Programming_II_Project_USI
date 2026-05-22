import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";
import { type BenchmarkSeries, STRATEGY } from "./benchmarks";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend";

// The strategy's underwater curve is drawn red by the backend figure
// (build_drawdown_figure), so its legend chip is red — not the cyan it uses on
// the equity chart. Benchmarks keep their series colours.
const STRATEGY_DD_HEX = "#f85149";

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  margin: { t: 16, r: 16, b: 40, l: 60 },
  // We draw our own top legend; suppress Plotly's (injected benchmark traces
  // are named, which would otherwise auto-show it).
  showlegend: false,
};

/** Underwater curve as a percentage: (equity / running-peak − 1) × 100. */
function underwater(equity: number[]): number[] {
  let peak = -Infinity;
  return equity.map((e) => {
    peak = Math.max(peak, e);
    return peak > 0 ? (e / peak - 1) * 100 : 0;
  });
}

const arrMin = (a: number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);

export function DrawdownChart({
  figure,
  benchmarks = [],
}: {
  figure: PlotlyFigure["figure"] | null;
  benchmarks?: BenchmarkSeries[];
}) {
  if (!figure) {
    return (
      <div className="flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono">
        No drawdown data yet.
      </div>
    );
  }

  // Strategy underwater comes from the backend figure; benchmarks are computed
  // client-side from their cached equity and injected as extra traces.
  const benchTraces = benchmarks.map((b) => ({
    type: "scatter" as const,
    mode: "lines" as const,
    x: b.equity.map((p) => p.ts),
    y: underwater(b.equity.map((p) => p.equity)),
    name: b.label,
    line: { color: b.hex, width: 1.6 },
    opacity: 0.95,
    hovertemplate: "%{x|%Y-%m-%d}<br>%{y:.1f}%<extra></extra>",
  }));

  const hasBench = benchTraces.length > 0;
  const data = hasBench
    ? [...(figure.data as Plotly.Data[]), ...(benchTraces as Plotly.Data[])]
    : (figure.data as Plotly.Data[]);

  let layout: Partial<Plotly.Layout> = { ...(figure.layout as Partial<Plotly.Layout>), ...DARK_LAYOUT };
  if (hasBench) {
    // Auto-scale to the worst drawdown across every active series.
    const stratY = ((figure.data as Array<{ y?: number[] }>)[0]?.y) ?? [0];
    const worst = Math.min(arrMin(stratY), ...benchTraces.map((t) => arrMin(t.y)));
    layout = { ...layout, yaxis: { ...DARK_LAYOUT.yaxis, range: [worst * 1.05, 0] } };
  }

  // Always-on top legend (matches the Equity Curve): strategy + active benchmarks.
  const legend: ChartLegendItem[] = [
    { label: STRATEGY.label, hex: STRATEGY_DD_HEX },
    ...benchmarks.map((b) => ({ label: b.label, hex: b.hex })),
  ];

  return (
    <div>
      <ChartLegend items={legend} />
      <Plot
        data={data}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "320px" }}
        config={{ displaylogo: false, responsive: true, displayModeBar: false }}
      />
    </div>
  );
}
