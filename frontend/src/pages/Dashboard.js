import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Api } from "@/api/client";
// ── Static platform stats ────────────────────────────────────────────────────
const PLATFORM_STATS = [
    { val: "4", label: "Strategies Available" },
    { val: "3", label: "Asset Classes" },
    { val: "10Y", label: "Max Lookback" },
    { val: "1D", label: "Data Interval" },
];
const FEATURE_CARDS = [
    {
        icon: "⚡",
        title: "Event-Driven Engine",
        desc: "Bar-by-bar simulation prevents look-ahead bias. Every signal fires on the close of the prior bar.",
    },
    {
        icon: "🔬",
        title: "Stress Testing",
        desc: "Adjust commission (0–2%) and slippage (0–1%) to find the friction floor where your edge disappears.",
    },
    {
        icon: "🤖",
        title: "AI Explainer",
        desc: "Get a plain-English breakdown of your results, regime analysis, and improvement suggestions.",
    },
];
// ── Component ─────────────────────────────────────────────────────────────────
export function Dashboard() {
    const [runs, setRuns] = useState([]);
    const [error, setError] = useState(null);
    useEffect(() => {
        let active = true;
        const tick = async () => {
            try {
                const data = await Api.listBacktests();
                if (!active)
                    return;
                setRuns(data);
                setError(null);
            }
            catch (e) {
                if (!active)
                    return;
                setError(String(e));
            }
        };
        tick();
        const interval = setInterval(tick, 5000);
        return () => { active = false; clearInterval(interval); };
    }, []);
    return (_jsxs("div", { className: "pb-16", children: [_jsxs("div", { className: "flex gap-10 px-10 pt-12 pb-10 items-start flex-wrap", children: [_jsxs("div", { className: "flex-1 min-w-[320px]", children: [_jsx("div", { className: "inline-block border border-accent-cyan text-accent-cyan\n                          font-mono text-[10px] tracking-[2px] px-2.5 py-1 rounded-sm mb-5", children: "QUANTEDGE PLATFORM v2.1" }), _jsxs("h1", { className: "text-4xl font-bold leading-tight text-ink-primary mb-4", children: ["Backtest Before", _jsx("br", {}), _jsx("span", { className: "text-accent-cyan", children: "You Risk Capital." })] }), _jsx("p", { className: "text-ink-muted text-[15px] leading-relaxed max-w-[500px]", children: "A professional-grade backtesting engine for retail quant traders. Test strategies across equities, FX and crypto \u2014 stress-test with commissions, slippage, and AI-powered insights." }), _jsxs("div", { className: "flex gap-3 mt-8", children: [_jsx(Link, { to: "/strategies", className: "btn-primary", children: "Select Strategy" }), _jsx(Link, { to: "/backtests/new", className: "btn-secondary", children: "Configure Run" })] })] }), _jsx("div", { className: "flex-shrink-0 w-[280px] border border-border-subtle rounded-lg overflow-hidden", children: _jsx("div", { className: "grid grid-cols-2", children: PLATFORM_STATS.map((s, i) => (_jsxs("div", { className: `bg-base px-5 py-5 text-center
                  ${i % 2 === 0 ? "border-r border-border" : ""}
                  ${i < 2 ? "border-b border-border" : ""}`, children: [_jsx("div", { className: "font-mono text-3xl font-bold text-accent-cyan", children: s.val }), _jsx("div", { className: "text-ink-muted text-xs mt-1", children: s.label })] }, s.label))) }) })] }), _jsx("div", { className: "px-10 pb-3 border-b border-border", children: _jsx("span", { className: "font-mono text-[11px] tracking-[2px] text-accent-cyan", children: "RECENT BACKTESTS" }) }), error && (_jsxs("div", { className: "mx-10 mt-4 card border-accent-red text-accent-red text-sm", children: ["Could not reach backend: ", error, ". Is uvicorn running on :8000?"] })), _jsxs("div", { className: "w-full overflow-x-auto", children: [_jsx("div", { className: "grid gap-0 border-b border-border px-10 py-2.5", style: { gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }, children: ["Strategy", "Asset", "Period", "Status", "Created", "", ""].map((h) => (_jsx("div", { className: "font-mono text-[10px] uppercase tracking-widest text-ink-muted", children: h }, h))) }), runs.length === 0 && !error && (_jsxs("div", { className: "px-10 py-12 text-center text-ink-muted text-sm", children: ["No runs yet.", " ", _jsx(Link, { to: "/backtests/new", className: "text-accent-cyan underline underline-offset-2", children: "Configure a backtest" }), " ", "to get started."] })), runs.map((r) => (_jsxs("div", { className: "grid border-b border-border px-10 py-3.5 hover:bg-white/[0.02] transition-colors cursor-default", style: { gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }, children: [_jsx("div", { className: "text-ink-primary text-sm font-medium flex items-center", children: r.strategy_id }), _jsx("div", { className: "font-mono text-[12px] text-ink-muted flex items-center", children: r.asset_id }), _jsxs("div", { className: "font-mono text-[11px] text-ink-muted flex items-center", children: [r.start_date.slice(0, 10), " \u2013 ", r.end_date.slice(0, 10)] }), _jsx("div", { className: "flex items-center", children: _jsx(StatusPill, { status: r.status }) }), _jsx("div", { className: "text-[11px] text-ink-muted flex items-center", children: new Date(r.created_at).toLocaleString() }), _jsx("div", {}), _jsx("div", { className: "flex items-center justify-end", children: _jsx(Link, { to: `/backtests/${r.id}`, className: "btn-ghost text-xs", children: "View" }) })] }, r.id)))] }), _jsx("div", { className: "grid grid-cols-3 gap-0 mx-10 mt-10 border border-border rounded-lg overflow-hidden", children: FEATURE_CARDS.map((card, i) => (_jsxs("div", { className: `bg-surface p-6 ${i < 2 ? "border-r border-border" : ""}`, children: [_jsx("div", { className: "text-2xl mb-3", children: card.icon }), _jsx("div", { className: "text-ink-primary font-semibold text-sm mb-2", children: card.title }), _jsx("div", { className: "text-ink-muted text-[13px] leading-relaxed", children: card.desc })] }, card.title))) })] }));
}
// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }) {
    const styles = {
        completed: "text-accent-green  border-accent-green/40  bg-accent-green/10",
        running: "text-accent-amber  border-accent-amber/40  bg-accent-amber/10",
        pending: "text-ink-muted     border-border           bg-surface",
        failed: "text-accent-red    border-accent-red/40    bg-accent-red/10",
    };
    return (_jsx("span", { className: `font-mono text-[10px] font-bold uppercase tracking-wider
                  px-2 py-0.5 rounded border ${styles[status] ?? "text-ink-muted border-border"}`, children: status }));
}
