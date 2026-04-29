import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";

/** Year × Month returns heatmap. */
export function MonthlyHeatmap({ figure }: { figure: PlotlyFigure["figure"] | null }) {
  if (!figure) {
    return (
      <div className="card flex items-center justify-center h-[320px] text-slate-400 text-sm">
        No monthly data yet
      </div>
    );
  }
  return (
    <div className="card">
      <Plot
        data={figure.data as Plotly.Data[]}
        layout={figure.layout as Partial<Plotly.Layout>}
        useResizeHandler
        style={{ width: "100%", height: "320px" }}
        config={{ displaylogo: false, responsive: true }}
      />
    </div>
  );
}
