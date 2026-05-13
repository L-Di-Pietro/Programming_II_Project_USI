import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  margin: { t: 16, r: 16, b: 40, l: 60 },
  showlegend: true,
  legend: { x: 1, xanchor: "right" as const, y: 1, yanchor: "top" as const, bgcolor: "rgba(0,0,0,0)", font: { size: 11 } },
};

/** Pure Plotly wrapper — card chrome is handled by the parent tab panel. */
export function EquityCurve({ figure }: { figure: PlotlyFigure["figure"] | null }) {
  if (!figure) {
    return <ChartEmpty label="No equity data yet." />;
  }
  return (
    <Plot
      data={figure.data as Plotly.Data[]}
      layout={{ ...(figure.layout as Partial<Plotly.Layout>), ...DARK_LAYOUT }}
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
