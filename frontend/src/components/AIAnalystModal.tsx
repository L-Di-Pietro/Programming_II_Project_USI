import { useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import ReactMarkdown from "react-markdown";

import { Api, type Metrics, type Report } from "@/api/client";

interface RunInfo {
  strategyName: string;
  asset: string;
}

/**
 * Centered modal that shows the AI Strategy Analyst report for a run. Opens
 * over a dark backdrop; loads the cached report (auto-generating one if none
 * exists yet) and offers PDF download + regeneration.
 */
export function AIAnalystModal({
  open,
  onClose,
  runId,
  metrics,
  runInfo,
}: {
  open: boolean;
  onClose: () => void;
  runId: number;
  metrics: Metrics | null;
  runInfo: RunInfo | null;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  // Which runId we've already kicked off a load for — guards the open effect
  // against re-running (and aborting its own fetch) when state changes.
  const loadedRef = useRef<number | null>(null);

  // On open: show the cached report, or auto-generate one if none exists.
  useEffect(() => {
    if (!open || loadedRef.current === runId) return;
    loadedRef.current = runId;
    let active = true;
    setStatus("loading");
    setError("");
    (async () => {
      try {
        const existing = await Api.getReport(runId);
        const r = existing ?? (await Api.generateReport(runId));
        if (active) {
          setReport(r);
          setStatus("idle");
        }
      } catch (e) {
        if (active) {
          setError(errMsg(e));
          setStatus("error");
          loadedRef.current = null; // allow a retry on reopen
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, runId]);

  // Esc closes; lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const regenerate = async () => {
    setStatus("loading");
    setError("");
    try {
      setReport(await Api.generateReport(runId));
      setStatus("idle");
    } catch (e) {
      setError(errMsg(e));
      setStatus("error");
    }
  };

  const downloadPdf = async () => {
    if (!report) return;
    setError("");
    setDownloading(true);
    try {
      const { exportReportPdf } = await import("@/utils/exportReportPdf");
      await exportReportPdf(runId, report); // cover + 5 charts + AI analysis + footer
    } catch (e) {
      setError(errMsg(e));
      setStatus("error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[600px] max-w-[calc(100vw-2.5rem)] max-h-[85vh] flex flex-col
                      overflow-hidden rounded-xl border border-accent-cyan/40 bg-surface">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-accent-cyan" />
            <span className="text-[15px] font-semibold text-ink-primary">
              AI Strategy Analyst
            </span>
            <span className="tag-mono border-accent-cyan text-accent-cyan text-[9px] tracking-widest">
              Claude
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-primary transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Subheader */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 border-b border-border">
          <span className="text-[12px] text-ink-muted">Analyzing</span>
          <span className="font-mono text-[12px] text-accent-cyan">
            {runInfo?.strategyName ?? "—"}
          </span>
          <span className="text-[12px] text-ink-muted">on</span>
          <span className="font-mono text-[12px] text-ink-primary">
            {runInfo?.asset ?? "—"}
          </span>
        </div>

        {/* Metrics strip */}
        <div className="flex border-b border-border divide-x divide-border">
          <MetricCell label="CAGR" value={pct(metrics?.return?.cagr_pct, true)}
            tone={tone(metrics?.return?.cagr_pct, (v) => v > 10)} />
          <MetricCell label="Sharpe" value={num(metrics?.risk?.sharpe_ratio)}
            tone={tone(metrics?.risk?.sharpe_ratio, (v) => v > 1)} />
          <MetricCell label="Max DD" value={pct(metrics?.risk?.max_drawdown_pct)}
            tone="text-accent-red" />
          <MetricCell label="Win Rate" value={pct(metrics?.trade?.win_rate_pct)}
            tone={tone(metrics?.trade?.win_rate_pct, (v) => v > 50)} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-[120px]">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <span className="w-7 h-7 rounded-full border-2 border-border-subtle
                               border-t-accent-cyan animate-spin" />
              <span className="font-mono text-[13px] text-ink-muted">
                Analysing backtest results
                <span className="animate-blink">_</span>
              </span>
            </div>
          )}

          {status === "error" && (
            <div className="text-accent-red font-mono text-sm border border-accent-red/30
                            bg-accent-red/10 rounded px-3 py-2">
              {error}
            </div>
          )}

          {status === "idle" && report && (
            <>
              {report.demo_mode && (
                <div className="mb-3 text-accent-amber font-mono text-[11px]">
                  Demo mode (NullProvider) — set a real LLM provider for live analysis.
                </div>
              )}
              <div className="report-prose">
                <ReactMarkdown>{report.text}</ReactMarkdown>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-border">
          <span className="text-ink-muted text-[11px]">
            AI analysis is not financial advice. Past performance does not guarantee future results.
          </span>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              className="btn-secondary text-xs py-1.5"
              onClick={regenerate}
              disabled={status === "loading"}
            >
              Regenerate
            </button>
            <button
              type="button"
              className="btn-primary text-xs py-1.5"
              onClick={downloadPdf}
              disabled={!report || status === "loading" || downloading}
            >
              {downloading ? "Downloading…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex-1 px-4 py-2.5 flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className={`font-mono text-[15px] font-bold ${tone}`}>{value}</span>
    </div>
  );
}

function pct(v: number | undefined, signed = false): string {
  if (v == null) return "—";
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function num(v: number | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

/** Green when `good(v)` holds, otherwise neutral; em-dash values stay neutral. */
function tone(v: number | undefined, good: (v: number) => boolean): string {
  if (v == null) return "text-ink-primary";
  return good(v) ? "text-accent-green" : "text-ink-primary";
}

function errMsg(e: unknown): string {
  if (e instanceof AxiosError) {
    if (e.code === "ECONNABORTED" || /timeout/i.test(e.message)) {
      return "The model is taking longer than usual (it may be busy). Try again — your report may already be saved.";
    }
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail;
    return detail ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
