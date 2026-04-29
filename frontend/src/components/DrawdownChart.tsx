import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";

/** Underwater (drawdown) chart — figure built backend-side. */
export function DrawdownChart({ figure }: { figure: PlotlyFigure["figure"] | null }) {
  if (!figure) {
    return (
      <div className="card flex items-center justify-center h-[280px] text-slate-400 text-sm">
        No drawdown data yet
      </div>
    );
  }
  return (
    <div className="card">
      <Plot
        data={figure.data as Plotly.Data[]}
        layout={figure.layout as Partial<Plotly.Layout>}
        useResizeHandler
        style={{ width: "100%", height: "280px" }}
        config={{ displaylogo: false, responsive: true }}
      />
    </div>
  );
}
