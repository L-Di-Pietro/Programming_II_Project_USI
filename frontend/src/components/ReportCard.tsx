import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Api, type Report } from "@/api/client";
import { timeAgo } from "@/utils/datetime";

export function ReportCard({ runId }: { runId: number }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState<"initial" | "generating" | null>("initial");
  const [downloading, setDownloading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading("initial");
    Api.getReport(runId)
      .then((r) => { if (active) { setReport(r); setLoading(null); } })
      .catch((e) => { if (active) { setError(fmt(e)); setLoading(null); } });
    return () => { active = false; };
  }, [runId]);

  const generate = async () => {
    setError(null);
    setLoading("generating");
    try {
      setReport(await Api.generateReport(runId));
    } catch (e) {
      setError(fmt(e));
    } finally {
      setLoading(null);
    }
  };

  const download = async () => {
    if (!report) return;
    setError(null);
    setDownloading(true);
    try {
      const { exportReportPdf } = await import("@/utils/exportReportPdf");
      await exportReportPdf(runId, report);
    } catch (e) {
      setError(fmt(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-accent-cyan" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            AI Strategy Analyst
          </span>
          <span className="tag-mono border-accent-cyan text-accent-cyan text-[9px] tracking-widest">
            Claude
          </span>
        </div>
        <Actions
          report={report}
          loading={loading}
          downloading={downloading}
          onGenerate={generate}
          onDownload={download}
        />
      </div>

      {/* Demo-mode banner */}
      {report?.demo_mode && (
        <div className="px-5 py-2.5 border-b border-border bg-accent-amber/5
                        text-accent-amber font-mono text-[11px]">
          Demo mode (NullProvider). Set{" "}
          <code className="text-accent-cyan">LLM_ENABLED=true</code> and{" "}
          <code className="text-accent-cyan">GEMINI_API_KEY</code> for real analysis.
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-5 bg-surface min-h-[100px]">
        {error && (
          <div className="text-accent-red font-mono text-sm border border-accent-red/30
                          bg-accent-red/10 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {loading === "initial" && !report && (
          <p className="text-ink-muted text-sm font-mono">Loading report...</p>
        )}

        {!report && loading === null && !error && (
          <p className="text-ink-muted text-sm">
            No report yet. Click <em>Generate report</em> to have the AI summarise this run's
            findings and limitations.
          </p>
        )}

        {report && (
          <div className="report-prose">
            <ReactMarkdown>{report.text}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border bg-surface
                      flex justify-between items-center">
        <span className="text-ink-muted text-[11px]">
          AI analysis is not financial advice. Past performance does not guarantee future results.
        </span>
        {report && (
          <span className="font-mono text-[11px] text-ink-muted">
            {timeAgo(report.generated_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function Actions({
  report, loading, downloading, onGenerate, onDownload,
}: {
  report: Report | null;
  loading: "initial" | "generating" | null;
  downloading: boolean;
  onGenerate: () => void;
  onDownload: () => void;
}) {
  if (loading === "generating") {
    return (
      <button className="btn-primary text-xs py-1.5 opacity-60" disabled>
        Generating...
      </button>
    );
  }
  if (!report) {
    return (
      <button
        className="btn-primary text-xs py-1.5"
        onClick={onGenerate}
        disabled={loading === "initial"}
      >
        Generate report
      </button>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <button
        className="font-mono text-[11px] text-accent-cyan hover:opacity-80 underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
        onClick={onDownload}
        disabled={downloading}
      >
        {downloading ? "Downloading…" : "Download PDF"}
      </button>
      <button
        className="font-mono text-[11px] text-accent-cyan hover:opacity-80 underline underline-offset-2"
        onClick={onGenerate}
      >
        Regenerate
      </button>
    </div>
  );
}

function fmt(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

