import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Api, type Report } from "@/api/client";

/**
 * Post-backtest LLM report card.
 *
 * On mount: fetches the cached report (if any) so revisits render instantly
 * without an LLM call. If no cached report exists, shows a "Generate report"
 * button that triggers POST. After generation, the same button morphs into a
 * small "Regenerate" link next to a relative timestamp.
 */
export function ReportCard({ runId }: { runId: number }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState<"initial" | "generating" | null>("initial");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading("initial");
    Api.getReport(runId)
      .then((r) => {
        if (!active) return;
        setReport(r);
        setLoading(null);
      })
      .catch((e) => {
        if (!active) return;
        setError(formatError(e));
        setLoading(null);
      });
    return () => {
      active = false;
    };
  }, [runId]);

  const generate = async () => {
    setError(null);
    setLoading("generating");
    try {
      const r = await Api.generateReport(runId);
      setReport(r);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2>AI report</h2>
        <ReportActions
          report={report}
          loading={loading}
          onGenerate={generate}
        />
      </div>

      {report?.demo_mode && (
        <p className="text-xs text-amber-700">
          LLM is in demo mode (NullProvider). Set <code>LLM_ENABLED=true</code>,{" "}
          <code>LLM_PROVIDER=gemini</code>, and <code>GEMINI_API_KEY</code> in
          your <code>.env</code> to get real Gemini-generated reports.
        </p>
      )}

      {error && (
        <div className="text-sm text-accent-red border border-red-200 rounded p-2 bg-red-50">
          {error}
        </div>
      )}

      {loading === "initial" && !report && (
        <p className="text-sm text-slate-400">Loading report…</p>
      )}

      {!report && loading === null && !error && (
        <p className="text-sm text-slate-500">
          No report yet. Click <em>Generate report</em> to have the AI summarise
          this run's findings and limitations.
        </p>
      )}

      {report && (
        <div className="report-prose text-sm text-slate-800">
          <ReactMarkdown>{report.text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inline subcomponents
// -----------------------------------------------------------------------------
function ReportActions({
  report,
  loading,
  onGenerate,
}: {
  report: Report | null;
  loading: "initial" | "generating" | null;
  onGenerate: () => void;
}) {
  if (loading === "generating") {
    return (
      <button className="btn-primary opacity-60" disabled>
        Generating…
      </button>
    );
  }
  if (!report) {
    return (
      <button className="btn-primary" onClick={onGenerate} disabled={loading === "initial"}>
        Generate report
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span>Generated {timeAgo(report.generated_at)}</span>
      <button
        className="text-slate-700 hover:text-slate-900 underline underline-offset-2"
        onClick={onGenerate}
      >
        Regenerate
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function formatError(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
