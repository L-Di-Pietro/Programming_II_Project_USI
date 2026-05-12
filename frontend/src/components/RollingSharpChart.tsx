import Plot from "react-plotly.js";

import type { EquityPoint } from "@/api/client";
import { ChartEmpty } from "@/components/EquityCurve";

const WINDOW = 42;

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d", tickformat: "%Y-%m" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  margin: { t: 16, r: 16, b: 40, l: 60 },
  showlegend: false,
};

function rollingMean(arr: number[], i: number, w: number): number {
  return arr.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w;
}

function rollingStd(arr: number[], i: number, w: number, mean: number): number {
  const slice = arr.slice(i - w + 1, i + 1);
  return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / w);
}

export function RollingSharpChart({ equityData }: { equityData: EquityPoint[] | null }) {
  if (!equityData || equityData.length < WINDOW + 2) {
    return <ChartEmpty label="Not enough data for rolling Sharpe (need 43+ bars)." />;
  }

  const equities = equityData.map((p) => p.equity);
  const dates    = equityData.map((p) => p.ts);

  // daily returns (length = n-1)
  const rets: number[] = [];
  for (let i = 1; i < equities.length; i++) {
    rets.push((equities[i] - equities[i - 1]) / equities[i - 1]);
  }

  const xs: string[] = [];
  const ys: number[] = [];
  for (let i = WINDOW - 1; i < rets.length; i++) {
    const mean = rollingMean(rets, i, WINDOW);
    const std  = rollingStd(rets, i, WINDOW, mean);
    if (std === 0) continue;
    xs.push(dates[i + 1]); // +1 because returns are shifted by 1
    ys.push((mean / std) * Math.sqrt(252));
  }

  const data: Plotly.Data[] = [
    {
      type: "scatter" as const,
      mode: "lines" as const,
      x: xs,
      y: ys,
      name: "Rolling Sharpe",
      line: { color: "#22d3ee", width: 1.5 },
      hovertemplate: "%{x|%Y-%m-%d}<br>Sharpe: %{y:.2f}<extra></extra>",
    },
  ];

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    shapes: [
      {
        type: "line" as const, xref: "paper" as const, yref: "y" as const,
        x0: 0, x1: 1, y0: 0, y1: 0,
        line: { color: "#30363d", width: 1, dash: "dash" as const },
      },
      {
        type: "line" as const, xref: "paper" as const, yref: "y" as const,
        x0: 0, x1: 1, y0: 1, y1: 1,
        line: { color: "#3fb950", width: 1, dash: "dash" as const },
      },
    ],
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
