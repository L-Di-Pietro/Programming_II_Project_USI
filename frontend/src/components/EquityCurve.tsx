import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend";

export type { ChartLegendItem };

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  margin: { t: 16, r: 16, b: 40, l: 60 },
};

/**
 * Pure Plotly wrapper — card chrome is handled by the parent tab panel.
 *
 * Benchmark overlays are injected into `figure.data` by the page (the
 * page-level toggle bar owns benchmark visibility). The page always passes
 * `legend` (the strategy plus any active benchmarks), which we draw as the
 * shared inline legend above the chart in place of Plotly's own.
 */
export function EquityCurve({
  figure,
  legend,
}: {
  figure: PlotlyFigure["figure"] | null;
  legend?: ChartLegendItem[];
}) {
  if (!figure) {
    return <ChartEmpty label="No equity data yet." />;
  }

  const showCustomLegend = !!legend && legend.length >= 1;

  const layout: Partial<Plotly.Layout> = {
    ...(figure.layout as Partial<Plotly.Layout>),
    ...DARK_LAYOUT,
    showlegend: !showCustomLegend,
    legend: !showCustomLegend
      ? { x: 1, xanchor: "right" as const, y: 1, yanchor: "top" as const, bgcolor: "rgba(0,0,0,0)", font: { size: 11 } }
      : undefined,
  };

  return (
    <div>
      {showCustomLegend && <ChartLegend items={legend!} />}
      <Plot
        data={figure.data as Plotly.Data[]}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "320px" }}
        config={{ displaylogo: false, responsive: true, displayModeBar: false }}
      />
    </div>
  );
}

export function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono">
      {label}
    </div>
  );
}
