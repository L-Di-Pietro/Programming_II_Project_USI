import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";

/**
 * Wraps a backend-built Plotly figure for the equity curve. The component is
 * dumb-by-design: backend hands us {data, layout}, we render. This keeps
 * chart logic in Python where it can be unit-tested.
 */
export function EquityCurve({ figure }: { figure: PlotlyFigure["figure"] | null }) {
  if (!figure) {
    return <EmptyState label="No equity data yet" />;
  }
  return (
    <div className="card">
      <Plot
        data={figure.data as Plotly.Data[]}
        layout={figure.layout as Partial<Plotly.Layout>}
        useResizeHandler
        style={{ width: "100%", height: "360px" }}
        config={{ displaylogo: false, responsive: true }}
      />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="card flex items-center justify-center h-[360px] text-slate-400 text-sm">
      {label}
    </div>
  );
}
