import { useEffect, useState } from "react";

import { Api, type BenchmarkKind } from "@/api/client";
import { BENCHMARKS } from "@/components/benchmarks";
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
  runId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  runId: number;
  onClose: () => void;
  onConfirm: (sections: ReportSections) => void;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(allOn);
  // Benchmarks that actually have data for THIS run (probed on open). null while
  // the probe is in flight; benchmarks are OFF by default (strategy only).
  const [benchAvail, setBenchAvail] = useState<BenchmarkKind[] | null>(null);
  const [benchOn, setBenchOn] = useState<Record<BenchmarkKind, boolean>>({
    buy_and_hold: false,
    sp500: false,
  });

  // Reset to "all on" every time the dialog opens.
  useEffect(() => {
    if (open) setEnabled(allOn());
  }, [open]);

  // Probe which benchmarks have data for this run so the picker lists only real
  // options. Same availability rule as the report builder (non-empty equity
  // curve), so the dialog and the generated PDF always agree.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setBenchAvail(null);
    setBenchOn({ buy_and_hold: false, sp500: false });
    void Promise.allSettled(BENCHMARKS.map((b) => Api.getBenchmarkEquity(runId, b.kind))).then(
      (results) => {
        if (!active) return;
        setBenchAvail(
          BENCHMARKS.filter((_, i) => {
            const r = results[i];
            return r.status === "fulfilled" && r.value.length > 0;
          }).map((b) => b.kind),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [open, runId]);

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
  const toggleBench = (k: BenchmarkKind) => setBenchOn((b) => ({ ...b, [k]: !b[k] }));
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

        {/* Benchmarks — only those with data for this run; off by default
            (strategy only). The Strategy line is always included. */}
        <div className="px-5 py-3 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              Benchmarks
            </span>
            <span className="text-[11px] text-ink-muted">Strategy is always included</span>
          </div>
          {benchAvail === null ? (
            <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-ink-muted">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-muted border-t-transparent animate-spin" />
              Checking available benchmarks…
            </div>
          ) : benchAvail.length === 0 ? (
            <div className="px-1 py-2 text-[12px] text-ink-muted">
              No benchmarks available for this run.
            </div>
          ) : (
            BENCHMARKS.filter((b) => benchAvail.includes(b.kind)).map((b) => {
              const isOn = benchOn[b.kind];
              return (
                <button
                  key={b.kind}
                  type="button"
                  role="checkbox"
                  aria-checked={isOn}
                  onClick={() => toggleBench(b.kind)}
                  className="w-full flex items-center gap-3 px-1 py-2 rounded-md text-left
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
                    <span className="block text-[13px] text-ink-primary leading-tight">{b.label}</span>
                    <span className="block text-[11px] text-ink-muted leading-tight">{b.sub}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-border">
          <button type="button" className="btn-secondary text-xs py-1.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs py-1.5"
            onClick={() => onConfirm({ ...enabled, benchmarks: benchOn } as ReportSections)}
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
