import { useEffect, useState } from "react";

import type { ReportSections } from "@/utils/exportReportHtml";

interface SectionDef {
  key: keyof ReportSections;
  label: string;
  hint: string;
}

// Order mirrors the report body. The cover + footer are always present, so they
// aren't listed here.
const SECTION_DEFS: SectionDef[] = [
  { key: "summary", label: "Executive Summary", hint: "Headline KPI cards" },
  { key: "metrics", label: "Full Metrics", hint: "All computed statistics" },
  { key: "comparison", label: "Benchmark Comparison", hint: "Strategy vs. benchmarks" },
  { key: "equity", label: "Equity Curve", hint: "Portfolio growth chart" },
  { key: "drawdown", label: "Drawdown", hint: "Underwater chart" },
  { key: "monthly", label: "Monthly Returns Heatmap", hint: "Calendar-month grid" },
  { key: "trades", label: "Trade P&L", hint: "Per-trade profit & loss" },
  { key: "commentary", label: "AI Analysis", hint: "LLM narrative" },
  { key: "params", label: "Run Parameters", hint: "Configuration appendix" },
];

const allOn = (): Record<string, boolean> =>
  Object.fromEntries(SECTION_DEFS.map((s) => [s.key, true]));
const allOff = (): Record<string, boolean> =>
  Object.fromEntries(SECTION_DEFS.map((s) => [s.key, false]));

/**
 * Lets the user choose which sections to include before exporting the static
 * PDF. Everything is on by default; unchecking a section (or graph) drops it.
 */
export function PdfSectionsDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (sections: ReportSections) => void;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(allOn);

  // Reset to "all on" every time the dialog opens.
  useEffect(() => {
    if (open) setEnabled(allOn());
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (k: string) => setEnabled((e) => ({ ...e, [k]: !e[k] }));
  const anyOn = Object.values(enabled).some(Boolean);
  const allSelected = Object.values(enabled).every(Boolean);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[420px] max-w-[calc(100vw-2.5rem)] max-h-[85vh] flex flex-col overflow-hidden
                   rounded-xl border border-accent-cyan/40 bg-surface"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <span className="text-[15px] font-semibold text-ink-primary">PDF sections</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-primary transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Intro + select/clear all */}
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border">
          <span className="text-[12px] text-ink-muted">
            All sections are included by default — uncheck any you want to leave out.
          </span>
          <button
            type="button"
            onClick={() => setEnabled(allSelected ? allOff() : allOn())}
            className="shrink-0 font-mono text-[11px] text-accent-cyan hover:underline"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          {SECTION_DEFS.map((s) => {
            const isOn = enabled[s.key];
            return (
              <button
                key={s.key}
                type="button"
                role="checkbox"
                aria-checked={isOn}
                onClick={() => toggle(s.key)}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left
                           hover:bg-white/[0.04] transition-colors"
              >
                <span
                  className={`shrink-0 w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors
                    ${isOn ? "bg-accent-cyan border-accent-cyan" : "bg-transparent border-border"}`}
                >
                  {isOn && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0e14"
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink-primary leading-tight">{s.label}</span>
                  <span className="block text-[11px] text-ink-muted leading-tight">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-border">
          <button type="button" className="btn-secondary text-xs py-1.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs py-1.5"
            onClick={() => onConfirm(enabled as ReportSections)}
            disabled={!anyOn}
            title={anyOn ? "Generate the PDF with the selected sections" : "Select at least one section"}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
