import { useMemo, useState } from "react";
import Plot from "react-plotly.js";

import type { PlotlyFigure } from "@/api/client";

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: "#161b22",
  plot_bgcolor:  "#0d1117",
  font:          { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
  xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
  margin: { t: 16, r: 16, b: 40, l: 60 },
};

type Benchmark = { name: string; color: string };

/** Pure Plotly wrapper — card chrome is handled by the parent tab panel. */
export function EquityCurve({ figure }: { figure: PlotlyFigure["figure"] | null }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const benchmarks: Benchmark[] = useMemo(() => {
    if (!figure) return [];
    return (figure.data as any[])
      .filter((trace) => trace?.name && trace.name !== "Strategy")
      .map((trace) => ({
        name: String(trace.name),
        color: (trace?.line?.color as string | undefined) ?? "#9ca3af",
      }));
  }, [figure]);

  const plottedData = useMemo(() => {
    if (!figure) return [];
    return (figure.data as any[]).map((trace) => {
      if (trace?.name && hidden.has(trace.name)) {
        return { ...trace, visible: "legendonly" };
      }
      return trace;
    });
  }, [figure, hidden]);

  if (!figure) {
    return <ChartEmpty label="No equity data yet." />;
  }

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const showLegend = benchmarks.length === 0;
  const layout: Partial<Plotly.Layout> = {
    ...(figure.layout as Partial<Plotly.Layout>),
    ...DARK_LAYOUT,
    showlegend: showLegend,
    legend: showLegend
      ? { x: 1, xanchor: "right" as const, y: 1, yanchor: "top" as const, bgcolor: "rgba(0,0,0,0)", font: { size: 11 } }
      : undefined,
  };

  return (
    <div>
      {benchmarks.length > 0 && (
        <BenchmarkToggleBar
          benchmarks={benchmarks}
          hidden={hidden}
          onToggle={toggle}
        />
      )}
      <Plot
        data={plottedData as Plotly.Data[]}
        layout={layout}
        useResizeHandler
        style={{ width: "100%", height: "320px" }}
        config={{ displaylogo: false, responsive: true, displayModeBar: false }}
      />
    </div>
  );
}

function BenchmarkToggleBar({
  benchmarks,
  hidden,
  onToggle,
}: {
  benchmarks: Benchmark[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-5 pt-4 pb-1 flex-wrap">
      <span className="section-title !mb-0 mr-1">Overlays</span>
      {/* Strategy is always shown — render a static pill so users know it's the headline trace. */}
      <StaticPill color="#22d3ee" label="Strategy" />
      {benchmarks.map((b) => (
        <TogglePill
          key={b.name}
          color={b.color}
          label={b.name}
          active={!hidden.has(b.name)}
          onClick={() => onToggle(b.name)}
        />
      ))}
    </div>
  );
}

function StaticPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-mono border border-border-subtle text-ink-primary">
      <span className="inline-block w-3 h-[2px] rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function TogglePill({
  color,
  label,
  active,
  onClick,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Hide ${label}` : `Show ${label}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-mono border transition ${
        active
          ? "border-border-subtle text-ink-primary hover:border-border"
          : "border-border-subtle/60 text-ink-muted line-through opacity-60 hover:opacity-90"
      }`}
    >
      <span
        className="inline-block w-3 h-[2px] rounded-sm"
        style={{ backgroundColor: active ? color : "#30363d" }}
      />
      {label}
    </button>
  );
}

export function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono">
      {label}
    </div>
  );
}
