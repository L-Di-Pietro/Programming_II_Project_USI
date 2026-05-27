// Single source of truth for benchmark-series presentation: labels, short
// tags, accent colours, and the token-based Tailwind classes for the metric
// identifier pills. Used by the toggle bar, MetricsPanel, the equity overlay
// traces, and the chart legend so all four stay in sync.
//
// Colours are the per-series accent tokens (tailwind.config.js: accent.cyan
// / accent.bh / accent.spx). The raw hex is duplicated here ONLY where a
// className can't reach: Plotly trace `line.color` and the legend SVG strokes.

import type { BenchmarkKind, EquityPoint } from "@/api/client";

export interface SeriesStyle {
  /** Full display name (chart legend, pill title). */
  label: string;
  /** Short monospace identifier shown next to metric values. */
  tag: string;
  /** Raw hex — for Plotly traces and SVG legend strokes only. */
  hex: string;
  /** Static Tailwind classes for the identifier pill (token-based). */
  tagClass: string;
}

export interface BenchmarkStyle extends SeriesStyle {
  kind: BenchmarkKind;
  /** Pill sub-label under the title. */
  sub: string;
}

export const STRATEGY: SeriesStyle = {
  label: "Strategy",
  tag: "STR",
  hex: "#22d3ee",
  tagClass: "text-accent-cyan border-accent-cyan bg-accent-cyan/[0.08]",
};

export const BENCHMARKS: BenchmarkStyle[] = [
  {
    kind: "buy_and_hold",
    label: "Buy & Hold",
    sub: "Same asset, no trading",
    tag: "B&H",
    hex: "#facc15",
    tagClass: "text-accent-bh border-accent-bh bg-accent-bh/[0.08]",
  },
  {
    kind: "sp500",
    label: "S&P 500",
    sub: "Equity benchmark",
    tag: "SPX",
    hex: "#c084fc",
    tagClass: "text-accent-spx border-accent-spx bg-accent-spx/[0.08]",
  },
];

/** A benchmark series paired with its cached equity curve — for chart overlays. */
export interface BenchmarkSeries {
  kind: BenchmarkKind;
  tag: string;
  label: string;
  hex: string;
  tagClass: string;
  equity: EquityPoint[];
}
