import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fmtBacktestDate } from "@/utils/datetime";

export type RunConfig = {
  strategyName: string;
  asset: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  params: Record<string, unknown>;
};

function humanizeKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const POPOVER_W = 280; // keep in sync with the popover's width style below
const MARGIN = 8; // min gap from the viewport edge
const GAP = 6; // gap between badge and popover

/**
 * Smart placement: prefer opening down-and-right from the badge, but flip left
 * when the popover would overflow the right edge and flip up when it would
 * overflow the bottom. Measured against the viewport — the popover is portaled
 * to <body>, so no ancestor (e.g. the AI modal's overflow-hidden panel) clips
 * it. Returns fixed-position coordinates.
 */
function placeFromBadge(badge: DOMRect, popH: number): { top: number; left: number } {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  let left = badge.left; // right-opening: popover's left edge aligns to badge's left
  if (left + POPOVER_W > vw - MARGIN) left = badge.right - POPOVER_W; // flip left
  left = Math.max(MARGIN, Math.min(left, vw - POPOVER_W - MARGIN));

  let top = badge.bottom + GAP; // down-opening
  if (top + popH > vh - MARGIN) {
    const above = badge.top - GAP - popH; // flip up
    top = above >= MARGIN ? above : Math.max(MARGIN, vh - popH - MARGIN);
  }
  return { top, left };
}

/**
 * Compact ⓘ pill that reveals the run's full configuration in a popover.
 * Click to toggle, click outside or Esc to close — never opens on its own.
 *
 * Border style: always #FFE600 (highlighter yellow). Smoothly transitions to
 * #60C8FF on hover. Yellow is unconditional — it doesn't depend on open or
 * focus state. Background stays transparent so the yellow is the dominant cue.
 */
export function ConfigPopover({
  run,
  forceClosed = false,
}: {
  run: RunConfig;
  /** When true, the popover is snapped shut and ignores its internal open
   *  state. Used to hide the Results-page header popover while the AI modal
   *  is open — the modal is vertically centered, so any open header popover
   *  would stay visible above the modal in the breadcrumb area. */
  forceClosed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const effectiveOpen = open && !forceClosed;

  // Position the popover when open, and keep it anchored on scroll/resize.
  useLayoutEffect(() => {
    if (!effectiveOpen) {
      setCoords(null);
      return;
    }
    const place = () => {
      const badge = btnRef.current?.getBoundingClientRect();
      if (badge) setCoords(placeFromBadge(badge, popRef.current?.offsetHeight ?? 0));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [effectiveOpen]);

  // Close on outside-click or Esc. The popover lives in a portal, so check both
  // the badge and the popover before treating a click as "outside".
  useEffect(() => {
    if (!effectiveOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [effectiveOpen]);

  const configRows = [
    { label: "Strategy", value: run.strategyName },
    { label: "Asset",    value: run.asset },
    { label: "Interval", value: run.timeframe === "1h" ? "Hourly (1H)" : "Daily (1D)" },
    { label: "Period",   value: `${fmtBacktestDate(run.startDate)} – ${fmtBacktestDate(run.endDate)}` },
  ];
  const paramRows = Object.entries(run.params);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={effectiveOpen}
        aria-label="Show backtest parameters"
        title="Backtest parameters"
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full
                   border-[1.5px] border-[#FFE600] hover:border-[#60C8FF]
                   bg-transparent text-ink-muted hover:text-[#60C8FF]
                   transition-colors duration-200 ease-out"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="6.4" />
          <path d="M8 7.3v3.4" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.55" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {effectiveOpen && createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            width: POPOVER_W,
            visibility: coords ? "visible" : "hidden",
          }}
          className="z-[60] bg-surface border border-border rounded-lg shadow-xl p-4 text-left cursor-default"
        >
          <div className="font-mono text-[10px] uppercase tracking-[2px] text-ink-muted mb-2.5">
            Backtest Configuration
          </div>
          <div className="flex flex-col divide-y divide-border">
            {configRows.map((r) => (
              <div key={r.label} className="flex justify-between items-baseline gap-3 py-1.5">
                <span className="text-ink-muted text-[12px]">{r.label}</span>
                <span className="font-mono text-[12px] text-ink-primary text-right">{r.value}</span>
              </div>
            ))}
          </div>

          <div className="font-mono text-[10px] uppercase tracking-[2px] text-ink-muted mt-3 mb-2.5">
            Strategy Parameters
          </div>
          {paramRows.length === 0 ? (
            <div className="text-ink-muted text-[12px]">No parameters.</div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {paramRows.map(([k, v]) => (
                <div key={k} className="flex justify-between items-baseline gap-3 py-1.5">
                  <span className="text-ink-muted text-[12px]">{humanizeKey(k)}</span>
                  <span className="font-mono text-[12px] text-accent-cyan text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
