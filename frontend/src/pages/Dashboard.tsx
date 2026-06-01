import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Api, type BacktestSummary, type Report } from "@/api/client";
import { PdfSectionsDialog } from "@/components/PdfSectionsDialog";
import { ReportActionMenu, type ReportMenuAction } from "@/components/ReportActionMenu";
import { formatApiError } from "@/utils/apiError";
import type { ReportSections } from "@/utils/exportReportHtml";
import { formatLocal } from "@/utils/datetime";
import { openReportTab } from "@/utils/reportTab";

// ── Max lookback descriptors (text rather than a single big number) ─────────
const LOOKBACK_LIMITS = [
  { tf: "Daily",  text: "Max yfinance Limit (Full History)" },
  { tf: "Hourly", text: "Max yfinance Limit (729 Days)" },
];

// Shared grid template for the Recent Backtests table. minmax(0, …fr) prevents
// columns from auto-growing past their fr-share when content (e.g. timestamps)
// is wider than the available space — otherwise header and rows desync.
const RUNS_GRID_COLUMNS =
  "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.6fr) 110px 90px";
const RUNS_HEADERS = ["Strategy", "Asset", "Period", "Status", "Created", "AI Report", ""];

// ── Component ─────────────────────────────────────────────────────────────────
export function Dashboard() {
  const [runs, setRuns] = useState<BacktestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [strategyCount, setStrategyCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const data = await Api.listBacktests();
        if (!active) return;
        setRuns(data);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(String(e));
      }
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let active = true;
    Api.listStrategies()
      .then((s) => { if (active) setStrategyCount(s.length); })
      .catch(() => { /* fall back to a dash; not worth surfacing here */ });
    return () => { active = false; };
  }, []);

  const topStats: { val: string; label: string; small?: boolean }[] = [
    { val: strategyCount === null ? "…" : String(strategyCount), label: "Strategies Available" },
    { val: "4",       label: "Asset Classes" },
    { val: "1D / 1H", label: "Data Interval", small: true },
  ];

  // Optimistically flip a row to the "report exists" state right after generation
  // so the UI updates without waiting for the 5s poll to reconcile the real value.
  const markGenerated = (id: number) =>
    setRuns((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, has_report: true, report_generated_at: new Date().toISOString() }
          : r,
      ),
    );

  return (
    <div className="pb-16">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="flex gap-10 px-4 sm:px-6 lg:px-10 pt-12 pb-10 items-start flex-wrap">
        <div className="flex-1 min-w-[320px]">
          {/* Badge */}
          <div className="inline-block border border-accent-cyan text-accent-cyan
                          font-mono text-[10px] tracking-[2px] px-2.5 py-1 rounded-sm mb-5">
            QUANTEDGE PLATFORM v2.1
          </div>
          <h1 className="text-4xl font-bold leading-tight text-ink-primary mb-4">
            Backtest Before<br />
            <span className="text-accent-cyan">You Risk Capital.</span>
          </h1>
          <p className="text-ink-muted text-[19px] leading-relaxed max-w-[500px]">
            A professional-grade backtesting engine for retail quant traders. Test strategies
            across equities, FX and crypto — stress-test with commissions, slippage, and
            AI-powered insights.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Link to="/strategies" className="btn-primary text-lg px-7 py-3.5 rounded-lg w-full sm:w-auto justify-center">
              Select Strategy
            </Link>
            <Link to="/backtests/new" className="btn-secondary text-lg px-7 py-3.5 rounded-lg w-full sm:w-auto justify-center">
              Configure Run
            </Link>
          </div>
        </div>

        {/* Stat box. Width tracks the ~20% content scale-up so the widest
            value ("1D / 1H") keeps its room; structure/columns/colors unchanged. */}
        <div className="flex-shrink-0 w-full max-w-[588px] lg:w-[588px] border border-border-subtle rounded-lg overflow-hidden">
          {/* Top row — three small stat cells. Fixed-height value area keeps
              labels aligned across boxes even when one value is smaller. */}
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {topStats.map((s, i) => (
              <div
                key={s.label}
                className={`bg-base px-4 py-5 sm:py-7 flex flex-col items-center justify-center text-center border-b border-border
                  ${i < 2 ? "sm:border-r" : ""}`}
              >
                <div className="h-[52px] flex items-center justify-center">
                  <span
                    className={`font-mono font-bold text-accent-cyan whitespace-nowrap ${
                      s.small ? "text-[34px]" : "text-[44px]"
                    }`}
                  >
                    {s.val}
                  </span>
                </div>
                <div className="text-[#F5F5F0] text-[17px] mt-2">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Bottom row — full-width Max Lookback box.
              Label sits ABOVE the two timeframe lines. */}
          <div className="bg-base px-7 py-7 text-center">
            <div className="text-[#F5F5F0] text-[17px] mb-3">Max Lookback</div>
            <div className="flex flex-col gap-2.5">
              {LOOKBACK_LIMITS.map((l) => (
                <div key={l.tf} className="text-[19px] leading-snug">
                  <span className="font-mono text-accent-cyan">{l.tf}:</span>{" "}
                  <span className="text-ink-muted">{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Backtests label ─────────────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-10 pb-3 border-b border-border">
        <span className="font-mono text-[11px] tracking-[2px] text-accent-cyan">
          RECENT BACKTESTS
        </span>
      </div>

      {error && (
        <div className="mx-4 sm:mx-6 lg:mx-10 mt-4 card border-accent-red text-accent-red text-sm">
          Could not reach backend: {error}. Is uvicorn running on :8000?
        </div>
      )}

      {/* ── Empty state (shared) ──────────────────────────────────── */}
      {runs.length === 0 && !error && (
        <div className="px-6 py-12 text-center text-ink-muted text-sm">
          No runs yet.{" "}
          <Link to="/backtests/new" className="text-accent-cyan underline underline-offset-2">
            Configure a backtest
          </Link>{" "}
          to get started.
        </div>
      )}

      {/* ── Runs table (tablet/desktop, md+) ──────────────────────── */}
      {runs.length > 0 && (
        <div className="hidden md:block w-full overflow-x-auto">
          {/* Table header */}
          <div className="grid gap-0 border-b border-border px-6 lg:px-10 py-2.5"
            style={{ gridTemplateColumns: RUNS_GRID_COLUMNS }}>
            {RUNS_HEADERS.map((h, i) => (
              <div key={i} className="font-mono text-[10px] uppercase tracking-widest text-ink-muted min-w-0 text-center">
                {h}
              </div>
            ))}
          </div>

          {runs.map((r) => (
            <div
              key={r.id}
              className="grid border-b border-border px-6 lg:px-10 py-3.5 hover:bg-white/[0.02] transition-colors cursor-default"
              style={{ gridTemplateColumns: RUNS_GRID_COLUMNS }}
            >
              <div className="text-ink-primary text-sm font-medium flex items-center justify-center min-w-0 truncate text-center">
                {r.strategy_name}
              </div>
              <div className="font-mono text-[12px] text-ink-muted flex items-center justify-center min-w-0 truncate text-center">
                {r.asset_symbol}
              </div>
              <div className="font-mono text-[11px] text-ink-muted flex items-center justify-center min-w-0 truncate text-center">
                {r.start_date.slice(0, 10)} &ndash; {r.end_date.slice(0, 10)}
              </div>
              <div className="flex items-center justify-center min-w-0">
                <StatusPill status={r.status} />
              </div>
              <div className="text-[11px] text-ink-muted flex items-center justify-center min-w-0 truncate text-center">
                {formatLocal(r.created_at)}
              </div>
              <div className="flex items-center justify-center gap-1 min-w-0">
                <AiReportCell run={r} onGenerated={markGenerated} />
              </div>
              <div className="flex items-center justify-end">
                <Link to={`/backtests/${r.id}`} className="btn-ghost text-xs">
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Runs cards (phones, <md) ──────────────────────────────── */}
      {runs.length > 0 && (
        <div className="md:hidden border-t border-border divide-y divide-border">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} onGenerated={markGenerated} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile run card (replaces the table row below md) ───────────────────────
function RunCard({
  run,
  onGenerated,
}: {
  run: BacktestSummary;
  onGenerated: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-ink-primary text-[15px] font-medium truncate">
            {run.strategy_name}
          </div>
          <div className="font-mono text-[12px] text-ink-muted mt-1 truncate">
            {run.asset_symbol} &middot; {run.start_date.slice(0, 10)} &ndash; {run.end_date.slice(0, 10)}
          </div>
        </div>
        <StatusPill status={run.status} />
      </div>

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-1">
          <AiReportCell run={run} onGenerated={onGenerated} />
        </div>
        <Link to={`/backtests/${run.id}`} className="btn-ghost text-sm">
          View
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-1 inline-flex items-center min-h-[44px] font-mono text-[11px] text-ink-muted hover:text-ink-primary transition-colors"
      >
        {expanded ? "Hide details" : "More details"}
      </button>
      {expanded && (
        <div className="-mt-1 pb-1 text-[12px] text-ink-muted">
          Created {formatLocal(run.created_at)}
        </div>
      )}
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "text-accent-green  border-accent-green/40  bg-accent-green/10",
    running:   "text-accent-amber  border-accent-amber/40  bg-accent-amber/10",
    pending:   "text-ink-muted     border-border           bg-surface",
    failed:    "text-accent-red    border-accent-red/40    bg-accent-red/10",
  };
  return (
    <span
      className={`font-mono text-[10px] font-bold uppercase tracking-wider
                  px-2 py-0.5 rounded border ${styles[status] ?? "text-ink-muted border-border"}`}
    >
      {status}
    </span>
  );
}

// ── AI Report cell ──────────────────────────────────────────────────────────────
// Three states per row, keyed by run id so transient state survives the 5s poll:
//   • no report  → Generate
//   • has report → Download + Regenerate
//   • working    → spinner (actions hidden ⇒ disabled); on failure → ⚠ + retry
type ReportPhase = "idle" | "working" | "error";

function AiReportCell({
  run,
  onGenerated,
}: {
  run: BacktestSummary;
  onGenerated: (id: number) => void;
}) {
  const [phase, setPhase] = useState<ReportPhase>("idle");
  const [downloading, setDownloading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  // Generate + Regenerate are the same call: POST overwrites the cached report.
  const generate = async () => {
    setPhase("working");
    setErrMsg("");
    try {
      await Api.generateReport(run.id);
      onGenerated(run.id);
      setPhase("idle");
    } catch (e) {
      setErrMsg(formatApiError(e));
      setPhase("error");
    }
  };

  // Every report action pulls the latest cached report, then delivers it via the
  // lazily-imported export module (inlines Plotly + fonts), so a view/download
  // always reflects the newest regeneration.
  const runReport = async (
    deliver: (report: Report) => Promise<void>,
    onError?: () => void,
  ) => {
    setDownloading(true);
    setErrMsg("");
    setPhase("idle");
    try {
      const report = await Api.getReport(run.id);
      if (!report) throw new Error("No report found — regenerate it first.");
      await deliver(report);
    } catch (e) {
      onError?.();
      setErrMsg(formatApiError(e));
      setPhase("error");
    } finally {
      setDownloading(false);
    }
  };

  // "See Report": open in a new tab. The tab must be opened synchronously in the
  // click (before the async fetch/import) or the popup is blocked.
  const seeReport = () => {
    const win = openReportTab();
    void runReport(
      async (report) => {
        const { openReportHtml } = await import("@/utils/exportReportHtml");
        await openReportHtml(run.id, report, win);
      },
      () => { if (win && !win.closed) win.close(); },
    );
  };

  // "Download PDF": first let the user pick which sections/graphs to include.
  const downloadPdf = () => setPdfDialogOpen(true);

  const confirmPdf = (sections: ReportSections) => {
    setPdfDialogOpen(false);
    void runReport(async (report) => {
      const { downloadReportPdf } = await import("@/utils/exportReportHtml");
      await downloadReportPdf(run.id, report, sections);
    });
  };

  const downloadHtml = () =>
    void runReport(async (report) => {
      const { downloadReportHtml } = await import("@/utils/exportReportHtml");
      await downloadReportHtml(run.id, report);
    });

  const reportActions: ReportMenuAction[] = [
    { key: "see", label: "See Report", hint: "Open the interactive report in a new tab", icon: <IconEye />, onSelect: seeReport },
    { key: "pdf", label: "Download PDF", hint: "Print-ready static PDF", icon: <IconFilePdf />, onSelect: downloadPdf },
    { key: "html", label: "Download HTML", hint: "Standalone interactive .html file", icon: <IconDownload />, onSelect: downloadHtml },
  ];

  if (phase === "working" || downloading) {
    return (
      <span
        className="w-3.5 h-3.5 rounded-full border-2 border-ink-muted border-t-transparent animate-spin"
        title={downloading ? "Building report…" : "Generating report…"}
        aria-label={downloading ? "Building report" : "Generating report"}
      />
    );
  }

  return (
    <>
      <PdfSectionsDialog
        open={pdfDialogOpen}
        onClose={() => setPdfDialogOpen(false)}
        onConfirm={confirmPdf}
      />
      {phase === "error" && (
        <span
          className="text-accent-red flex items-center"
          title={errMsg || "Report action failed — click to retry"}
        >
          <IconWarning />
        </span>
      )}
      {run.has_report ? (
        <>
          <ReportActionMenu actions={reportActions} />
          <button
            type="button"
            onClick={generate}
            className="btn-ghost text-xs px-1.5 opacity-70 hover:opacity-100"
            title="Regenerate report"
            aria-label="Regenerate report"
          >
            <IconRefresh />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={generate}
          className="btn-ghost text-xs px-2"
          title="Generate AI report"
        >
          <IconReport />
          <span>Generate</span>
        </button>
      )}
    </>
  );
}

// ── Icons (match App.tsx convention: 24 viewBox, currentColor, strokeWidth 1.75) ──
function IconReport() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="12" y1="10" x2="12" y2="16" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconFilePdf() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M12 11v6" />
      <path d="M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}
