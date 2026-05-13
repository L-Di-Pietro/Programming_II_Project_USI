import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Api } from "./api/client";
import { Dashboard } from "./pages/Dashboard";
import { NewBacktest } from "./pages/NewBacktest";
import { RunResults } from "./pages/RunResults";
import { Strategies } from "./pages/Strategies";
// ── Inline SVG icon primitives ─────────────────────────────────────────────
function IconDashboard() {
    return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "3", y: "14", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "14", width: "7", height: "7" })] }));
}
function IconStrategies() {
    return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "8", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "8", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "8", y1: "18", x2: "21", y2: "18" }), _jsx("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }), _jsx("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }), _jsx("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" })] }));
}
function IconConfigure() {
    return (_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }) }));
}
function IconResults() {
    return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("circle", { cx: "12", cy: "12", r: "6" }), _jsx("circle", { cx: "12", cy: "12", r: "2" })] }));
}
// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
    const location = useLocation();
    const [latestRunId, setLatestRunId] = useState(null);
    // Re-fetch latest run ID after each navigation so a just-completed backtest
    // appears immediately when the user lands on /backtests/:id.
    useEffect(() => {
        Api.listBacktests().then((runs) => {
            if (runs.length > 0)
                setLatestRunId(runs[0].id);
        }).catch(() => { });
    }, [location.pathname]);
    const pageTitle = (() => {
        if (location.pathname === "/")
            return "Dashboard";
        if (location.pathname === "/strategies")
            return "Strategies";
        if (location.pathname === "/backtests/new")
            return "Configure";
        if (location.pathname.startsWith("/backtests/"))
            return "Results";
        return "QuantBacktest";
    })();
    const onResultsPage = location.pathname.startsWith("/backtests/") &&
        !location.pathname.startsWith("/backtests/new");
    const staticNav = [
        { to: "/", label: "Dashboard", Icon: IconDashboard },
        { to: "/strategies", label: "Strategies", Icon: IconStrategies },
        { to: "/backtests/new", label: "Configure", Icon: IconConfigure },
    ];
    return (_jsxs("div", { className: "flex min-h-screen bg-base text-ink-primary", children: [_jsxs("aside", { className: "w-[180px] shrink-0 flex flex-col border-r border-border bg-base", children: [_jsxs("div", { className: "flex items-center gap-2.5 px-5 py-5 border-b border-border", children: [_jsx("span", { className: "w-2.5 h-2.5 shrink-0 bg-accent-cyan", style: { clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" } }), _jsx("span", { className: "font-mono text-[11px] font-bold tracking-widest text-ink-primary", children: "QUANTEDGE" })] }), _jsxs("nav", { className: "flex flex-col mt-1 flex-1", children: [staticNav.map(({ to, label, Icon }) => {
                                const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
                                return (_jsxs(Link, { to: to, className: `relative flex items-center gap-2.5 px-5 py-2.5 text-[13px] transition-colors ${active
                                        ? "text-accent-cyan bg-accent-cyan/[0.07] font-medium"
                                        : "text-ink-muted hover:text-ink-primary hover:bg-white/[0.03]"}`, children: [active && (_jsx("span", { className: "absolute left-0 top-0 bottom-0 w-[3px] bg-accent-cyan rounded-r" })), _jsx(Icon, {}), label] }, to));
                            }), latestRunId !== null && (_jsxs(Link, { to: `/backtests/${latestRunId}`, className: `relative flex items-center gap-2.5 px-5 py-2.5 text-[13px] transition-colors ${onResultsPage
                                    ? "text-accent-cyan bg-accent-cyan/[0.07] font-medium"
                                    : "text-ink-muted hover:text-ink-primary hover:bg-white/[0.03]"}`, children: [onResultsPage && (_jsx("span", { className: "absolute left-0 top-0 bottom-0 w-[3px] bg-accent-cyan rounded-r" })), _jsx(IconResults, {}), "Results", _jsx("span", { className: `ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${onResultsPage ? "bg-accent-cyan" : "bg-accent-cyan/40"}` })] }))] }), _jsx("div", { className: "px-5 py-4 text-[10px] font-mono text-ink-muted border-t border-border", children: "USI PROG II \u2014 2.8" })] }), _jsxs("div", { className: "flex flex-col flex-1 min-w-0", children: [_jsxs("header", { className: "flex items-center justify-between px-8 py-3.5 border-b border-border bg-base shrink-0", children: [_jsx("span", { className: "text-sm font-semibold text-ink-primary tracking-wide", children: pageTitle }), _jsxs("div", { className: "flex items-center gap-2 text-[10px] font-mono text-ink-muted uppercase tracking-widest", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent-green" }), "Live"] })] }), _jsx("main", { className: "flex-1 overflow-y-auto", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/strategies", element: _jsx(Strategies, {}) }), _jsx(Route, { path: "/backtests/new", element: _jsx(NewBacktest, {}) }), _jsx(Route, { path: "/backtests/:runId", element: _jsx(RunResults, {}) })] }) })] })] }));
}
