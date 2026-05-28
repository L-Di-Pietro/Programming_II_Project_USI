import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

  const effectiveOpen = open && !forceClosed;

  useEffect(() => {
    if (!effectiveOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative inline-flex">
      <button
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

      {effectiveOpen && (
        <div className="absolute left-0 top-[26px] z-30 w-[280px] bg-surface border border-border rounded-lg shadow-xl p-4 text-left cursor-default">
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
        </div>
      )}
    </div>
  );
}
