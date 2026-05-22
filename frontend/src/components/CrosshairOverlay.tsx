/**
 * CrosshairOverlay — shared crosshair-hover infrastructure for line charts.
 *
 * Provides:
 * 1. `useCrosshair()` hook — manages hover state from Plotly events
 * 2. `<CrosshairTooltip>` — renders stacked info boxes below a chart
 * 3. `crosshairLayoutPatch()` — layout config for hovermode + spike lines
 * 4. `buildHighlightDots()` — invisible marker traces that appear on hover
 */
import { useCallback, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HoverPoint {
  /** Series label (e.g. "Strategy", "Buy & Hold"). */
  label: string;
  /** Series color hex. */
  hex: string;
  /** X value (date string). */
  x: string;
  /** Y value. */
  y: number;
  /** Formatted Y string for display. */
  yFmt: string;
  /** Optional override color for the value text. */
  yColor?: string;
}

export interface HoverState {
  /** Pixel x-position relative to the chart container. */
  pixelX: number;
  /** All hovered data points across series. */
  points: HoverPoint[];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Manages crosshair hover state from Plotly `onHover` / `onUnhover` events.
 *
 * @param seriesMeta Array of `{ label, hex }` in the same order as the
 *   *visible* line traces (before any highlight-dot traces).
 * @param formatY   Formatter for Y values (default: 2 decimal places).
 */
export function useCrosshair(
  seriesMeta: { label: string; hex: string }[],
  formatY: (v: number, seriesIdx: number) => string = (v) => v.toFixed(2),
) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onHover = useCallback(
    (event: Readonly<Plotly.PlotHoverEvent>) => {
      if (!event.points || event.points.length === 0) return;

      const points: HoverPoint[] = [];
      for (const pt of event.points) {
        const idx = pt.curveNumber;
        // Skip highlight-dot traces (they come after the real series)
        if (idx >= seriesMeta.length) continue;
        const meta = seriesMeta[idx];
        if (!meta) continue;
        points.push({
          label: meta.label,
          hex: meta.hex,
          x: String(pt.x),
          y: pt.y as number,
          yFmt: formatY(pt.y as number, idx),
        });
      }

      if (points.length === 0) return;

      // Get pixel position relative to container
      const container = containerRef.current;
      if (!container) return;

      const plotEl = container.querySelector(".js-plotly-plot") as HTMLElement | null;
      if (!plotEl) return;

      // event.event is the underlying mouse event
      const mouseEvent = (event as unknown as { event: MouseEvent }).event;
      if (!mouseEvent) return;

      const rect = container.getBoundingClientRect();
      const pixelX = mouseEvent.clientX - rect.left;

      setHover({ pixelX, points });
    },
    [seriesMeta, formatY],
  );

  const onUnhover = useCallback(() => {
    setHover(null);
  }, []);

  return { hover, onHover, onUnhover, containerRef };
}

// ─── Tooltip Component ───────────────────────────────────────────────────────

/**
 * Renders stacked info boxes below the chart that follow the cursor
 * horizontally.
 */
export function CrosshairTooltip({
  hover,
  containerWidth,
}: {
  hover: HoverState | null;
  containerWidth?: number;
}) {
  if (!hover || hover.points.length === 0) return null;

  // Clamp tooltip position so it doesn't overflow the container
  const tooltipWidth = 200;
  const maxLeft = (containerWidth ?? 9999) - tooltipWidth - 8;
  const left = Math.max(8, Math.min(hover.pixelX - tooltipWidth / 2, maxLeft));

  return (
    <div
      style={{
        position: "relative",
        left: `${left}px`,
        width: `${tooltipWidth}px`,
        zIndex: 10,
        pointerEvents: "none",
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {hover.points.map((pt) => (
        <div
          key={pt.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 10px",
            marginBottom: 2,
            background: "rgba(22, 27, 34, 0.92)",
            border: `1px solid ${pt.hex}33`,
            borderRadius: 6,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: pt.hex,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#7d8590", flexShrink: 0 }}>{pt.label}</span>
          <span style={{ color: pt.yColor ?? "#e6edf3", marginLeft: "auto", fontWeight: 600 }}>
            {pt.yFmt}
          </span>
        </div>
      ))}
      {/* Date label */}
      <div
        style={{
          textAlign: "center",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color: "#7d8590",
          marginTop: 2,
        }}
      >
        {hover.points[0]?.x ? formatDate(hover.points[0].x) : ""}
      </div>
    </div>
  );
}

function formatDate(x: string): string {
  // Try to parse as date
  const d = new Date(x);
  if (isNaN(d.getTime())) return x;
  return d.toISOString().slice(0, 10);
}

// ─── Layout patch ────────────────────────────────────────────────────────────

/** Returns layout overrides for crosshair hover behavior. */
export function crosshairLayoutPatch(): Partial<Plotly.Layout> {
  return {
    hovermode: "x" as const,
    // Suppress Plotly's default hover labels — we render our own below
    hoverlabel: { bgcolor: "rgba(0,0,0,0)", bordercolor: "rgba(0,0,0,0)", font: { size: 0, color: "rgba(0,0,0,0)" } },
    xaxis: {
      showspikes: true,
      spikemode: "across" as const,
      spikethickness: 1,
      spikecolor: "rgba(255,255,255,0.08)",
      spikedash: "solid" as const,
      spikesnap: "cursor" as const,
    },
  };
}

/**
 * Deep-merges the crosshair layout patch into an existing layout.
 * Preserves existing xaxis/yaxis properties.
 */
export function mergeCrosshairLayout(base: Partial<Plotly.Layout>): Partial<Plotly.Layout> {
  const patch = crosshairLayoutPatch();
  return {
    ...base,
    hovermode: patch.hovermode,
    hoverlabel: patch.hoverlabel,
    xaxis: { ...(base.xaxis as object), ...(patch.xaxis as object) },
  };
}
