// Shared inline chart legend — a horizontal row of chips drawn above a chart.
// Used by the Equity Curve, Drawdown, and the Rolling Sharpe "Series" /
// "Thresholds" groups so the legend looks identical across every tab.

/** One chip: a short line sample + a coloured label. */
export interface ChartLegendItem {
  label: string;
  /** Sample-line and label colour. */
  hex: string;
  /** SVG `stroke-dasharray` for the sample (omit = solid) — used by thresholds. */
  dash?: string;
}

export function LegendChip({ item }: { item: ChartLegendItem }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="32" height="2" viewBox="0 0 32 2" className="overflow-visible">
        <line
          x1="0"
          y1="1"
          x2="32"
          y2="1"
          stroke={item.hex}
          strokeWidth="2"
          strokeDasharray={item.dash}
        />
      </svg>
      <span className="font-mono text-[11px]" style={{ color: item.hex }}>
        {item.label}
      </span>
    </div>
  );
}

/** Horizontal row of legend chips. Renders nothing when empty. */
export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-6 px-5 pt-4 pb-1 flex-wrap">
      {items.map((it) => (
        <LegendChip key={it.label} item={it} />
      ))}
    </div>
  );
}
