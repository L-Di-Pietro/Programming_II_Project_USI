import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Api } from "@/api/client";
import { DrawdownChart } from "@/components/DrawdownChart";
import { EquityCurve } from "@/components/EquityCurve";
import { MetricsPanel } from "@/components/MetricsPanel";
import { MonthlyHeatmap } from "@/components/MonthlyHeatmap";
import { ReportCard } from "@/components/ReportCard";
import { RollingSharpChart } from "@/components/RollingSharpChart";
import { TradePnlChart } from "@/components/TradePnlChart";
import { TradeList } from "@/components/TradeList";
const CHART_TABS = [
    { id: "equity", label: "Equity Curve" },
    { id: "drawdown", label: "Drawdown" },
    { id: "heatmap", label: "Monthly Returns" },
    { id: "trade_pnl", label: "Trade P&L" },
    { id: "rolling_sharpe", label: "Rolling Sharpe" },
];
export function RunResults() {
    const { runId } = useParams();
    const id = Number(runId);
    const reportRef = useRef(null);
    const [metrics, setMetrics] = useState(null);
    const [equityFig, setEquityFig] = useState(null);
    const [drawdownFig, setDrawdownFig] = useState(null);
    const [equityData, setEquityData] = useState(null);
    const [trades, setTrades] = useState([]);
    const [runDates, setRunDates] = useState(null);
    const [error, setError] = useState(null);
    const [activeChart, setActiveChart] = useState("equity");
    useEffect(() => {
        if (!Number.isFinite(id))
            return;
        let active = true;
        Promise.all([
            Api.getMetrics(id),
            Api.getChart(id, "equity"),
            Api.getChart(id, "drawdown"),
            Api.getEquity(id),
            Api.getTrades(id),
            Api.getBacktest(id),
        ])
            .then(([m, eq, dd, ev, ts, run]) => {
            if (!active)
                return;
            setMetrics(m);
            setEquityFig(eq.figure);
            setDrawdownFig(dd.figure);
            setEquityData(ev);
            setTrades(ts);
            setRunDates({ start: run.start_date.slice(0, 4), end: run.end_date.slice(0, 4) });
        })
            .catch((e) => { if (active)
            setError(String(e)); });
        return () => { active = false; };
    }, [id]);
    if (!Number.isFinite(id)) {
        return _jsx("div", { className: "m-10 card border-accent-red text-accent-red", children: "Invalid run ID." });
    }
    return (_jsxs("div", { className: "px-10 py-8 pb-16 space-y-5", children: [_jsxs("div", { className: "flex items-end justify-between flex-wrap gap-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 text-[13px] mb-2 flex-wrap", children: [_jsx(Link, { to: "/", className: "text-ink-muted hover:text-ink-primary transition-colors", children: "Backtest" }), _jsx("span", { className: "text-border-subtle", children: "/" }), _jsxs("span", { className: "text-accent-cyan font-mono font-medium", children: ["Run #", id] }), runDates && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-border-subtle", children: "\u00B7" }), _jsxs("span", { className: "font-mono text-[12px] text-ink-muted", children: [runDates.start, "\u2013", runDates.end] })] }))] }), _jsx("h2", { className: "text-ink-primary", children: "Backtest Results" })] }), _jsxs("div", { className: "flex gap-2.5", children: [_jsx("button", { className: "btn-secondary border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10", onClick: () => reportRef.current?.scrollIntoView({ behavior: "smooth" }), children: "AI Analysis" }), _jsx(Link, { to: "/backtests/new", className: "btn-secondary", children: "Run New Backtest" })] })] }), error && (_jsx("div", { className: "card border-accent-red text-accent-red text-sm", children: error })), _jsx(MetricsPanel, { metrics: metrics }), _jsxs("div", { className: "border border-border rounded-lg overflow-hidden", children: [_jsx("div", { className: "flex items-center border-b border-border px-5 gap-0 bg-surface", children: CHART_TABS.map((t) => (_jsx("button", { onClick: () => setActiveChart(t.id), className: `px-4 py-3.5 text-[13px] border-b-2 transition-colors whitespace-nowrap ${activeChart === t.id
                                ? "border-accent-cyan text-accent-cyan"
                                : "border-transparent text-ink-muted hover:text-ink-primary"}`, children: t.label }, t.id))) }), _jsxs("div", { className: "bg-surface", children: [activeChart === "equity" && _jsx(EquityCurve, { figure: equityFig }), activeChart === "drawdown" && _jsx(DrawdownChart, { figure: drawdownFig }), activeChart === "heatmap" && _jsx(MonthlyHeatmap, { equityData: equityData }), activeChart === "trade_pnl" && _jsx(TradePnlChart, { trades: trades }), activeChart === "rolling_sharpe" && _jsx(RollingSharpChart, { equityData: equityData })] })] }), _jsx(TradeList, { trades: trades }), _jsx("div", { ref: reportRef, children: _jsx(ReportCard, { runId: id }) })] }));
}
