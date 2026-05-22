import { useCallback, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend";
import { CrosshairTooltip, type HoverState } from "./CrosshairOverlay";

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

  // Build series meta from data traces for crosshair
  const seriesMeta = useMemo(() => {
    const figData = figure.data as Plotly.Data[];
    return figData.map((trace, _i) => {
      const t = trace as Record<string, unknown>;
      const line = t.line as Record<string, unknown> | undefined;
      return {
        label: (t.name as string) || `Series ${_i}`,
        hex: (line?.color as string) || "#7d8590",
      };
    });
  }, [figure.data]);

  return (
    <EquityCurvePlot
      figure={figure}
      legend={legend}
      showCustomLegend={showCustomLegend}
      seriesMeta={seriesMeta}
    />
  );
}

/** Inner component managing crosshair hover state. */
function EquityCurvePlot({
  figure,
  legend,
  showCustomLegend,
  seriesMeta,
}: {
  figure: PlotlyFigure["figure"];
  legend?: ChartLegendItem[];
  showCustomLegend: boolean;
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
            yFmt: `$${(pt.y as number).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
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

  // Strip hovertemplate from backend traces so Plotly doesn't render its own
  // grey hover labels. We use our custom CrosshairTooltip below instead.
  const patchedData = (figure.data as Plotly.Data[]).map((trace) => {
    const t = { ...trace } as Record<string, unknown>;
    delete t.hovertemplate;
    t.hoverinfo = "none";
    return t as Plotly.Data;
  });

  const layout: Partial<Plotly.Layout> = {
    ...(figure.layout as Partial<Plotly.Layout>),
    ...DARK_LAYOUT,
    showlegend: !showCustomLegend,
    legend: !showCustomLegend
      ? { x: 1, xanchor: "right" as const, y: 1, yanchor: "top" as const, bgcolor: "rgba(0,0,0,0)", font: { size: 11 } }
      : undefined,
    hovermode: "x" as const,
    xaxis: {
      ...((figure.layout as Record<string, unknown>)?.xaxis as object),
      ...(DARK_LAYOUT.xaxis as object),
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
      {showCustomLegend && <ChartLegend items={legend!} />}
      <Plot
        data={patchedData}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "320px" }}
        config={{ displaylogo: false, responsive: true, displayModeBar: false }}
        onHover={onHover}
        onUnhover={onUnhover}
      />
      <CrosshairTooltip hover={hover} containerWidth={containerWidth} />
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
