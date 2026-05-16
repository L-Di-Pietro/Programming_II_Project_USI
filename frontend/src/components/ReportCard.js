import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Api } from "@/api/client";
export function ReportCard({ runId }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState("initial");
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        let active = true;
        setLoading("initial");
        Api.getReport(runId)
            .then((r) => { if (active) {
            setReport(r);
            setLoading(null);
        } })
            .catch((e) => { if (active) {
            setError(fmt(e));
            setLoading(null);
        } });
        return () => { active = false; };
    }, [runId]);
    const generate = async () => {
        setError(null);
        setLoading("generating");
        try {
            setReport(await Api.generateReport(runId));
        }
        catch (e) {
            setError(fmt(e));
        }
        finally {
            setLoading(null);
        }
    };
    const download = async () => {
        if (!report)
            return;
        setError(null);
        setDownloading(true);
        try {
            const { exportReportPdf } = await import("@/utils/exportReportPdf");
            await exportReportPdf(runId, report);
        }
        catch (e) {
            setError(fmt(e));
        }
        finally {
            setDownloading(false);
        }
    };
    return (_jsxs("div", { className: "border border-border rounded-lg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-accent-cyan" }), _jsx("span", { className: "font-mono text-[10px] uppercase tracking-widest text-ink-muted", children: "AI Strategy Analyst" }), _jsx("span", { className: "tag-mono border-accent-cyan text-accent-cyan text-[9px] tracking-widest", children: "Claude" })] }), _jsx(Actions, { report: report, loading: loading, downloading: downloading, onGenerate: generate, onDownload: download })] }), report?.demo_mode && (_jsxs("div", { className: "px-5 py-2.5 border-b border-border bg-accent-amber/5\n                        text-accent-amber font-mono text-[11px]", children: ["Demo mode (NullProvider). Set", " ", _jsx("code", { className: "text-accent-cyan", children: "LLM_ENABLED=true" }), " and", " ", _jsx("code", { className: "text-accent-cyan", children: "GEMINI_API_KEY" }), " for real analysis."] })), _jsxs("div", { className: "px-5 py-5 bg-surface min-h-[100px]", children: [error && (_jsx("div", { className: "text-accent-red font-mono text-sm border border-accent-red/30\n                          bg-accent-red/10 rounded px-3 py-2 mb-3", children: error })), loading === "initial" && !report && (_jsx("p", { className: "text-ink-muted text-sm font-mono", children: "Loading report..." })), !report && loading === null && !error && (_jsxs("p", { className: "text-ink-muted text-sm", children: ["No report yet. Click ", _jsx("em", { children: "Generate report" }), " to have the AI summarise this run's findings and limitations."] })), report && (_jsx("div", { className: "report-prose", children: _jsx(ReactMarkdown, { children: report.text }) }))] }), _jsxs("div", { className: "px-5 py-3 border-t border-border bg-surface\n                      flex justify-between items-center", children: [_jsx("span", { className: "text-ink-muted text-[11px]", children: "AI analysis is not financial advice. Past performance does not guarantee future results." }), report && (_jsx("span", { className: "font-mono text-[11px] text-ink-muted", children: timeAgo(report.generated_at) }))] })] }));
}
function Actions({ report, loading, downloading, onGenerate, onDownload, }) {
    if (loading === "generating") {
        return (_jsx("button", { className: "btn-primary text-xs py-1.5 opacity-60", disabled: true, children: "Generating..." }));
    }
    if (!report) {
        return (_jsx("button", { className: "btn-primary text-xs py-1.5", onClick: onGenerate, disabled: loading === "initial", children: "Generate report" }));
    }
    return (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("button", { className: "font-mono text-[11px] text-accent-cyan hover:opacity-80 underline underline-offset-2 disabled:opacity-50 disabled:no-underline", onClick: onDownload, disabled: downloading, children: downloading ? "Downloading…" : "Download PDF" }), _jsx("button", { className: "font-mono text-[11px] text-accent-cyan hover:opacity-80 underline underline-offset-2", onClick: onGenerate, children: "Regenerate" })] }));
}
function fmt(e) {
    if (e && typeof e === "object" && "message" in e)
        return String(e.message);
    return String(e);
}
function timeAgo(iso) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60)
        return "just now";
    const m = Math.floor(seconds / 60);
    if (m < 60)
        return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h} h ago`;
    return `${Math.floor(h / 24)} d ago`;
}
