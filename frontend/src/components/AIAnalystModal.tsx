import { useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import ReactMarkdown from "react-markdown";

import { Api, type Metrics, type Report } from "@/api/client";
import { ConfigPopover } from "@/components/ConfigPopover";
import { fmtBacktestDate } from "@/utils/datetime";

interface RunInfo {
  strategyName: string;
  asset: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  params: Record<string, unknown>;
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

        {/* Subheader — title line + parameters badge.
            Date range comes from the same runInfo state the Results page header
            uses, so the two displays can never drift. */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 border-b border-border">
          <span className="text-[12px] text-ink-muted">Analyzing</span>
          <span className="font-mono text-[12px] text-accent-cyan">
            {runInfo?.strategyName ?? "—"}
          </span>
          <span className="text-[12px] text-ink-muted">on</span>
          <span className="font-mono text-[12px] text-ink-primary">
            {runInfo?.asset ?? "—"}
          </span>
          {runInfo && (
            <>
              <span className="text-border-subtle">&middot;</span>
              <span className="font-mono text-[12px] text-ink-muted">
                {fmtBacktestDate(runInfo.startDate)} &ndash; {fmtBacktestDate(runInfo.endDate)}
              </span>
              <ConfigPopover run={runInfo} />
            </>
          )}
        </div>

        {/* Metrics grid — iterates the full backend payload (return + risk +
            trade) so new metrics auto-appear. The four originals (CAGR, Sharpe,
            Max DD, Win Rate) are still present as part of that natural order. */}
        <MetricsGrid metrics={metrics} />

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
    <div className="px-4 py-2.5 flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className={`font-mono text-[15px] font-bold ${tone}`}>{value}</span>
    </div>
  );
}

// ── Formatters and tone helpers ──────────────────────────────────────────────

function pctFmt(v: number, signed = false): string {
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function n2(v: number): string {
  return v.toFixed(2);
}

const neutralTone = () => "text-ink-primary";
const greenTone   = () => "text-accent-green";
const redTone     = () => "text-accent-red";
const signedTone  = (v: number) => v >= 0 ? "text-accent-green" : "text-accent-red";
const threshTone  = (lo: number, hi: number) => (v: number) =>
  v >= hi ? "text-accent-green" : v >= lo ? "text-accent-amber" : "text-accent-red";

// ── Metrics grid (iterates the full backend payload) ─────────────────────────

type MetricMeta = {
  label: string;
  format: (v: number) => string;
  tone:   (v: number) => string;
};

// Per-key formatting + colour. Unknown keys fall back to humanized label +
// 2-decimal number + neutral colour, so new backend metrics auto-appear.
const METRIC_META: Record<string, MetricMeta> = {
  cagr_pct:                   { label: "CAGR",          format: (v) => pctFmt(v, true),           tone: signedTone },
  total_return_pct:           { label: "Total Return",  format: (v) => pctFmt(v, true),           tone: signedTone },
  annualized_volatility_pct:  { label: "Volatility",    format: (v) => pctFmt(v),                 tone: neutralTone },
  sharpe_ratio:               { label: "Sharpe",        format: n2,                               tone: threshTone(0.5, 1) },
  sortino_ratio:              { label: "Sortino",       format: n2,                               tone: threshTone(0.8, 1.2) },
  calmar_ratio:               { label: "Calmar",        format: n2,                               tone: threshTone(0.5, 1) },
  max_drawdown_pct:           { label: "Max DD",        format: (v) => pctFmt(v),                 tone: redTone },
  max_drawdown_duration_days: { label: "DD Duration",   format: (v) => `${Math.round(v)}d`,       tone: neutralTone },
  total_trades:               { label: "Trades",        format: (v) => Math.round(v).toString(),  tone: neutralTone },
  win_rate_pct:               { label: "Win Rate",      format: (v) => pctFmt(v),                 tone: threshTone(40, 55) },
  avg_win:                    { label: "Avg Win",       format: n2,                               tone: greenTone },
  avg_loss:                   { label: "Avg Loss",      format: n2,                               tone: redTone },
  win_loss_ratio:             { label: "Payoff",        format: (v) => `${n2(v)}x`,               tone: greenTone },
  profit_factor:              { label: "Profit Factor", format: n2,                               tone: threshTone(1, 1.5) },
};

function getMeta(key: string): MetricMeta {
  return METRIC_META[key] ?? {
    label:  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    format: n2,
    tone:   neutralTone,
  };
}

function MetricsGrid({ metrics }: { metrics: Metrics | null }) {
  const entries: [string, number][] = metrics
    ? [
        ...Object.entries(metrics.return),
        ...Object.entries(metrics.risk),
        ...Object.entries(metrics.trade),
      ]
    : [];
  if (entries.length === 0) {
    // No metrics yet — render a placeholder row so the strip keeps its
    // visual weight while data loads.
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 border-b border-border divide-x divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCell key={i} label="—" value="—" tone="text-ink-muted" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 border-b border-border divide-x divide-y divide-border">
      {entries.map(([key, value]) => {
        const meta = getMeta(key);
        // "—" only when the metric is mathematically undefined (Pydantic emits
        // null for inf/NaN); finite 0 still renders as 0 / 0%.
        const isUndef = value == null || !Number.isFinite(value);
        return (
          <MetricCell
            key={key}
            label={meta.label}
            value={isUndef ? "—" : meta.format(value)}
            tone={isUndef ? "text-ink-muted" : meta.tone(value)}
          />
        );
      })}
    </div>
  );
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
