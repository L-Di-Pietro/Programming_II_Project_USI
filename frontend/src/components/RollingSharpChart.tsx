import Plot from "react-plotly.js";

import type { EquityPoint } from "@/api/client";
import { type BenchmarkSeries, STRATEGY } from "./benchmarks";
import { ChartEmpty } from "@/components/EquityCurve";
import { LegendChip, type ChartLegendItem } from "./ChartLegend";

// Industry-standard 1-year rolling window. Shorter windows (e.g. 42) produce
// visually unreadable noise.
const WINDOW = 252;

const PLOT_H = 320;          // chart height (px)
const PLOT_TOP = 16;         // layout margin.t
const PLOT_BOTTOM = 40;      // layout margin.b
const INNER_H = PLOT_H - PLOT_TOP - PLOT_BOTTOM; // usable y span in px
const LABEL_GAP = 16;        // min px between end labels

// Threshold reference lines (kept dashed — reference-line convention).
const THRESHOLDS = [
  { label: "Risk-Free Baseline (0.0)", value: 0, hex: "#f85149", plotlyDash: "6px,5px", svgDash: "6 5" },
  { label: "Acceptable (1.0)",         value: 1, hex: "#f0a500", plotlyDash: "2px,4px", svgDash: "2 4" },
  { label: "Excellent (2.0)",          value: 2, hex: "#3fb950", plotlyDash: "2px,4px", svgDash: "2 4" },
];

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d", tickformat: "%Y-%m" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  margin: { t: PLOT_TOP, r: 88, b: PLOT_BOTTOM, l: 60 },
  showlegend: false,
};

function rollingMean(arr: number[], i: number, w: number): number {
  return arr.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w;
}
function rollingStd(arr: number[], i: number, w: number, mean: number): number {
  const slice = arr.slice(i - w + 1, i + 1);
  return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / w);
}

/** Rolling annualised Sharpe of an equity series (same method as the strategy). */
function rollingSharpe(equity: number[], dates: string[]): { xs: string[]; ys: number[] } {
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push((equity[i] - equity[i - 1]) / equity[i - 1]);
  const xs: string[] = [];
  const ys: number[] = [];
  for (let i = WINDOW - 1; i < rets.length; i++) {
    const mean = rollingMean(rets, i, WINDOW);
    const std = rollingStd(rets, i, WINDOW, mean);
    if (std === 0) continue;
    xs.push(dates[i + 1]); // returns are shifted by 1
    ys.push((mean / std) * Math.sqrt(252));
  }
  return { xs, ys };
}

type SeriesInput = { label: string; hex: string; width: number; opacity: number; equity: EquityPoint[] };

export function RollingSharpChart({
  equityData,
  benchmarks = [],
}: {
  equityData: EquityPoint[] | null;
  benchmarks?: BenchmarkSeries[];
}) {
  if (!equityData || equityData.length < WINDOW + 2) {
    return <ChartEmpty label="Not enough data for rolling Sharpe (need 253+ bars)." />;
  }

  const inputs: SeriesInput[] = [
    { label: STRATEGY.label, hex: STRATEGY.hex, width: 2.2, opacity: 1, equity: equityData },
    ...benchmarks.map((b) => ({ label: b.label, hex: b.hex, width: 1.4, opacity: 0.72, equity: b.equity })),
  ];

  // Compute each series' rolling Sharpe; keep only those with data.
  const computed = inputs
    .map((s) => ({ ...s, ...rollingSharpe(s.equity.map((p) => p.equity), s.equity.map((p) => p.ts)) }))
    .filter((s) => s.ys.length > 0);

  const allY = computed.flatMap((s) => s.ys);
  const min = Math.min(...allY, 0);
  const max = Math.max(...allY, 0);
  let yMin = Math.max(Math.floor(min) - 0.2, -2);
  let yMax = Math.min(Math.ceil(max) + 0.2, 4);
  if (yMax - yMin < 3) {
    yMax = Math.min(yMin + 3, 4);
    if (yMax - yMin < 3) yMin = yMax - 3;
  }

  // Line traces: benchmarks first (behind), strategy last (on top).
  const lineTraces: Plotly.Data[] = computed
    .map((s) => ({
      type: "scatter" as const,
      mode: "lines" as const,
      x: s.xs,
      y: s.ys,
      name: s.label,
      line: { color: s.hex, width: s.width },
      opacity: s.opacity,
      hovertemplate: "%{x|%Y-%m-%d}<br>Sharpe: %{y:.2f}<extra></extra>",
    }))
    .reverse(); // inputs has strategy first; reverse so strategy draws last

  // End-of-line dot per series.
  const dotTraces: Plotly.Data[] = computed.map((s) => ({
    type: "scatter" as const,
    mode: "markers" as const,
    x: [s.xs[s.xs.length - 1]],
    y: [s.ys[s.ys.length - 1]],
    marker: { color: s.hex, size: 7 },
    hoverinfo: "skip" as const,
  }));

  // End-of-line labels with vertical de-overlap + leader lines (annotation arrows).
  const pixelY = (v: number) => ((yMax - v) / (yMax - yMin)) * INNER_H;
  const labelled = computed
    .map((s) => ({ s, lastX: s.xs[s.xs.length - 1], lastY: s.ys[s.ys.length - 1] }))
    .sort((a, b) => pixelY(a.lastY) - pixelY(b.lastY)); // top → bottom
  let prevPx = -Infinity;
  const annotations: Partial<Plotly.Annotations>[] = labelled.map(({ s, lastX, lastY }) => {
    const naturalPx = pixelY(lastY);
    const placedPx = Math.max(naturalPx, prevPx + LABEL_GAP);
    prevPx = placedPx;
    return {
      x: lastX,
      y: lastY,
      xref: "x" as const,
      yref: "y" as const,
      text: lastY.toFixed(2),
      showarrow: true,
      arrowcolor: s.hex,
      arrowwidth: 1,
      arrowhead: 0,
      ax: 22,
      ay: placedPx - naturalPx, // px; >0 pushes the label down
      font: { color: s.hex, size: 10, family: "JetBrains Mono, monospace" },
      xanchor: "left" as const,
      bgcolor: "rgba(0,0,0,0)",
    };
  });

  // Threshold lines + good-zone band (band only when 0 and 1 are both in view).
  const shapes: Partial<Plotly.Shape>[] = [];
  if (yMin <= 0 && yMax >= 1) {
    shapes.push({
      type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 0, y1: 1,
      fillcolor: "rgba(63,185,80,0.04)", line: { width: 0 }, layer: "below",
    });
  }
  for (const t of THRESHOLDS) {
    shapes.push({
      type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: t.value, y1: t.value,
      line: { color: t.hex, width: 1, dash: t.plotlyDash as Plotly.Dash }, opacity: 0.7,
    });
  }

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    yaxis: { ...DARK_LAYOUT.yaxis, range: [yMin, yMax] },
    shapes,
    annotations,
  };

  return (
    <div>
      <RollingSharpeLegend benchmarks={benchmarks} />
      <Plot
        data={[...lineTraces, ...dotTraces]}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: `${PLOT_H}px` }}
        config={{ displaylogo: false, responsive: true, displayModeBar: false }}
      />
    </div>
  );
}

/** HTML legend above the chart: "Series" group (when benchmarks active) + a
 *  thin divider + the always-on "Thresholds" group. */
function RollingSharpeLegend({ benchmarks }: { benchmarks: BenchmarkSeries[] }) {
  const seriesItems: ChartLegendItem[] = benchmarks.length > 0
    ? [
        { label: STRATEGY.label, hex: STRATEGY.hex },
        ...benchmarks.map((b) => ({ label: b.label, hex: b.hex })),
      ]
    : [];
  const thresholdItems: ChartLegendItem[] = THRESHOLDS.map((t) => ({
    label: t.label, hex: t.hex, dash: t.svgDash,
  }));

  return (
    <div className="flex items-center gap-4 px-5 pt-4 pb-1 flex-wrap">
      {seriesItems.length > 0 && (
        <>
          <div className="flex items-center gap-6 flex-wrap">
            {seriesItems.map((it) => <LegendChip key={it.label} item={it} />)}
          </div>
          <div className="w-px h-4 bg-border-subtle" />
        </>
      )}
      <div className="flex items-center gap-6 flex-wrap">
        {thresholdItems.map((it) => <LegendChip key={it.label} item={it} />)}
      </div>
    </div>
  );
}
