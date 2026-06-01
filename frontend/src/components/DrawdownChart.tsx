import { useCallback, useRef, useState } from "react";
import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";
import { type BenchmarkSeries, STRATEGY } from "./benchmarks";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend";
import { CrosshairTooltip, type HoverState } from "./CrosshairOverlay";

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
      <div className="flex items-center justify-center h-[260px] sm:h-[320px] text-ink-muted text-sm font-mono">
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
    hoverinfo: "none" as const,
  }));

  const hasBench = benchTraces.length > 0;
  const data = hasBench
    ? [...(figure.data as Plotly.Data[]), ...(benchTraces as Plotly.Data[])]
    : (figure.data as Plotly.Data[]);

  // Upgrade strategy trace (data[0]) to gradient area fill.
  // Drawdown values are ≤ 0, so the gradient runs from y=0 (transparent) down
  // to the worst trough (opaque red). `fillcolor` is kept as a fallback for
  // Plotly versions that don't support fillgradient.
  if (data.length > 0) {
    const strat = data[0] as Record<string, unknown>;
    const yVals = (strat.y as number[]) ?? [];
    const worst = yVals.length > 0 ? Math.min(...yVals) : -10;
    strat.fill = "tozeroy";
    strat.fillcolor = "rgba(248, 81, 73, 0.08)";
    strat.fillgradient = {
      type: "vertical",
      start: 0,
      stop: worst,
      colorscale: [
        [0.0, "rgba(248, 81, 73, 0.0)"],
        [1.0, "rgba(248, 81, 73, 0.35)"],
      ],
    };
  }

  // Build series meta for crosshair
  const seriesMeta = [
    { label: STRATEGY.label, hex: STRATEGY_DD_HEX },
    ...benchmarks.map((b) => ({ label: b.label, hex: b.hex })),
  ];

  let baseLayout: Partial<Plotly.Layout> = { ...(figure.layout as Partial<Plotly.Layout>), ...DARK_LAYOUT };
  if (hasBench) {
    // Auto-scale to the worst drawdown across every active series.
    const stratY = ((figure.data as Array<{ y?: number[] }>)[0]?.y) ?? [0];
    const worst = Math.min(arrMin(stratY), ...benchTraces.map((t) => arrMin(t.y)));
    baseLayout = { ...baseLayout, yaxis: { ...DARK_LAYOUT.yaxis, range: [worst * 1.05, 0] } };
  }

  // Always-on top legend (matches the Equity Curve): strategy + active benchmarks.
  const legend: ChartLegendItem[] = [
    { label: STRATEGY.label, hex: STRATEGY_DD_HEX },
    ...benchmarks.map((b) => ({ label: b.label, hex: b.hex })),
  ];

  return (
    <DrawdownPlot
      data={data}
      baseLayout={baseLayout}
      legend={legend}
      seriesMeta={seriesMeta}
    />
  );
}

/** Inner component managing crosshair hover state. */
function DrawdownPlot({
  data,
  baseLayout,
  legend,
  seriesMeta,
}: {
  data: Plotly.Data[];
  baseLayout: Partial<Plotly.Layout>;
  legend: ChartLegendItem[];
  seriesMeta: { label: string; hex: string }[];
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const onHover = useCallback(
    (event: Readonly<Plotly.PlotHoverEvent>) => {
      if (!event.points || event.points.length === 0) return;

      const points = event.points
        .filter((pt) => pt.curveNumber < seriesMeta.length)
        .map((pt) => {
          const meta = seriesMeta[pt.curveNumber];
          return {
            label: meta?.label ?? "",
            hex: meta?.hex ?? "#7d8590",
            x: String(pt.x),
            y: pt.y as number,
            yFmt: `${(pt.y as number).toFixed(1)}%`,
          };
        });

      if (points.length === 0) return;

      const container = containerRef.current;
      if (container && containerWidth === 0) {
        setContainerWidth(container.getBoundingClientRect().width);
      }

      const mouseEvent = (event as unknown as { event: MouseEvent }).event;
      const rect = containerRef.current?.getBoundingClientRect();
      const pixelX = mouseEvent && rect ? mouseEvent.clientX - rect.left : 0;

      setHover({ pixelX, points });
    },
    [seriesMeta, containerWidth],
  );

  const onUnhover = useCallback(() => {
    setHover(null);
  }, []);

  // Strip hovertemplate from backend traces so Plotly doesn't render grey labels.
  const patchedData = data.map((trace) => {
    const t = { ...trace } as Record<string, unknown>;
    delete t.hovertemplate;
    t.hoverinfo = "none";
    return t as Plotly.Data;
  });

  const layout: Partial<Plotly.Layout> = {
    ...baseLayout,
    hovermode: "x" as const,
    xaxis: {
      ...(baseLayout.xaxis as object),
      showspikes: true,
      spikemode: "across" as const,
      spikethickness: 1,
      spikecolor: "rgba(255,255,255,0.08)",
      spikedash: "solid" as const,
      spikesnap: "cursor" as const,
    },
  };

  return (
    <div ref={containerRef}>
      <ChartLegend items={legend} />
      <Plot
        data={patchedData}
        layout={layout}
        useResizeHandler
        className="h-[260px] sm:h-[320px]"
        style={{ width: "100%", touchAction: "pan-y" }}
        config={{ displaylogo: false, responsive: true, displayModeBar: false }}
        onHover={onHover}
        onUnhover={onUnhover}
      />
      <CrosshairTooltip hover={hover} containerWidth={containerWidth} />
    </div>
  );
}
