import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";
import { type ChartLegendItem } from "./ChartLegend";

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
 * Pure Plotly wrapper — card chrome (tab bar + badge legend) lives in the
 * parent. Benchmark overlays are injected into `figure.data` by the page;
 * hover uses Plotly's native labels, tinted to each series' line colour.
 */
export function EquityCurve({
  figure,
}: {
  figure: PlotlyFigure["figure"] | null;
}) {
  if (!figure) {
    return <ChartEmpty label="No equity data yet." />;
  }

  // Give every trace a hover label tinted to its own line colour.
  const data = (figure.data as Plotly.Data[]).map((trace) => {
    const t = trace as Record<string, unknown>;
    const line = t.line as Record<string, unknown> | undefined;
    const color = (line?.color as string) || "#e6edf3";
    return { ...t, hoverlabel: { font: { color } } } as Plotly.Data;
  });

  const layout: Partial<Plotly.Layout> = {
    ...(figure.layout as Partial<Plotly.Layout>),
    ...DARK_LAYOUT,
    showlegend: false,
    hovermode: "closest" as const,
    hoverlabel: { bgcolor: "#161b22", bordercolor: "#30363d" },
  };

  return (
    <Plot
      data={data}
      layout={layout}
      useResizeHandler
      style={{ width: "100%", height: "320px" }}
      config={{ displaylogo: false, responsive: true, displayModeBar: false }}
    />
  );
}

export function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono">
      {label}
    </div>
  );
}
