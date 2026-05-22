import { useCallback, useRef, useState } from "react";
import Plot from "react-plotly.js";

import type { Trade } from "@/api/client";
import { ChartEmpty } from "@/components/EquityCurve";
import { CrosshairTooltip, type HoverState } from "./CrosshairOverlay";

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d", tickprefix: "$" },
  margin: { t: 16, r: 16, b: 40, l: 70 },
  showlegend: false,
};

/** Explains why benchmarks have no per-trade P&L. Shown when a benchmark is on. */
function BenchmarkNote() {
  return (
    <div className="mx-5 mb-4 rounded-lg border border-dashed border-accent-pink/[0.35] bg-accent-pink/[0.05] px-3.5 py-3 text-[12px] text-ink-muted leading-relaxed">
      Per-trade view. Benchmarks (Buy &amp; Hold, S&amp;P 500) are passive holdings,
      not trading strategies — they don&rsquo;t generate per-trade P&amp;L to compare
      against. See the <span className="text-accent-cyan">Equity Curve</span>,{" "}
      <span className="text-accent-cyan">Drawdown</span>, or{" "}
      <span className="text-accent-cyan">Rolling Sharpe</span> tabs for
      benchmark-aware comparisons.
    </div>
  );
}

export function TradePnlChart({
  trades,
  showBenchmarkNote = false,
}: {
  trades: Trade[] | null;
  showBenchmarkNote?: boolean;
}) {
  if (!trades || trades.length === 0) {
    return (
      <div>
        <ChartEmpty label="No trades yet." />
        {showBenchmarkNote && <BenchmarkNote />}
      </div>
    );
  }

  // Build a lookup of trade index → net P&L for hover highlight coloring
  const pnlByIndex: Record<number, number> = {};
  trades.forEach((t, i) => { pnlByIndex[i] = t.net_pnl; });

  const wins   = trades.map((t, i) => ({ i, v: t.net_pnl })).filter((x) => x.v > 0);
  const losses = trades.map((t, i) => ({ i, v: t.net_pnl })).filter((x) => x.v <= 0);

  const data: Plotly.Data[] = [
    {
      type: "bar" as const,
      x: wins.map((x) => x.i),
      y: wins.map((x) => x.v),
      name: "Win",
      marker: { color: "#3fb950" },
      hoverinfo: "none" as const,
    },
    {
      type: "bar" as const,
      x: losses.map((x) => x.i),
      y: losses.map((x) => x.v),
      name: "Loss",
      marker: { color: "#f85149" },
      hoverinfo: "none" as const,
    },
  ];

  return (
    <div>
      <TradePnlPlot data={data} pnlByIndex={pnlByIndex} />
      {showBenchmarkNote && <BenchmarkNote />}
    </div>
  );
}

/** Inner component that manages hover-highlight shapes and tooltip via state. */
function TradePnlPlot({
  data,
  pnlByIndex,
}: {
  data: Plotly.Data[];
  pnlByIndex: Record<number, number>;
}) {
  const [highlightShapes, setHighlightShapes] = useState<Partial<Plotly.Shape>[]>([]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const onHover = useCallback(
    (event: Readonly<Plotly.PlotHoverEvent>) => {
      if (!event.points || event.points.length === 0) return;
      const pt = event.points[0];
      const tradeIdx = pt.x as number;
      const pnl = pnlByIndex[tradeIdx];
      if (pnl === undefined) return;

      const isWin = pnl > 0;
      const fillColor = isWin
        ? "rgba(63, 185, 80, 0.08)"
        : "rgba(248, 81, 73, 0.08)";

      setHighlightShapes([
        {
          type: "rect" as const,
          xref: "x" as const,
          yref: "paper" as const,
          x0: tradeIdx - 0.45,
          x1: tradeIdx + 0.45,
          y0: 0,
          y1: 1,
          fillcolor: fillColor,
          line: { width: 0 },
          layer: "below" as const,
        },
      ]);

      // Build crosshair tooltip
      const container = containerRef.current;
      if (container && containerWidth === 0) {
        setContainerWidth(container.getBoundingClientRect().width);
      }

      const mouseEvent = (event as unknown as { event: MouseEvent }).event;
      const rect = containerRef.current?.getBoundingClientRect();
      const pixelX = mouseEvent && rect ? mouseEvent.clientX - rect.left : 0;

      setHover({
        pixelX,
        points: [{
          label: `Trade #${tradeIdx}`,
          hex: isWin ? "#3fb950" : "#f85149",
          x: `Trade #${tradeIdx}`,
          y: pnl,
          yFmt: `$${pnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          yColor: isWin ? "#3fb950" : "#f85149",
        }],
      });
    },
    [pnlByIndex, containerWidth],
  );

  const onUnhover = useCallback(() => {
    setHighlightShapes([]);
    setHover(null);
  }, []);

  const zeroLine: Partial<Plotly.Shape> = {
    type: "line" as const,
    xref: "paper" as const,
    yref: "y" as const,
    x0: 0, x1: 1, y0: 0, y1: 0,
    line: { color: "#30363d", width: 1, dash: "dot" as const },
  };

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    hovermode: "x" as const,
    shapes: [zeroLine, ...highlightShapes],
  };

  return (
    <div ref={containerRef}>
      <Plot
        data={data}
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
