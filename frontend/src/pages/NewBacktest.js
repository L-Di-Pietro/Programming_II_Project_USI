import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Api } from "@/api/client";
import { StrategyConfigForm } from "@/components/StrategyConfigForm";
// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByClass(assets) {
    return assets.reduce((acc, a) => {
        (acc[a.asset_class] ??= []).push(a);
        return acc;
    }, {});
}
function yearsBetween(start, end) {
    return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / (365.25 * 24 * 3600 * 1000));
}
// ── Component ─────────────────────────────────────────────────────────────────
export function NewBacktest() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [assets, setAssets] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    // Form state
    const [strategySlug, setStrategySlug] = useState(null);
    const [assetClass, setAssetClass] = useState("equity");
    const [symbol, setSymbol] = useState(null);
    const [params, setParams] = useState({});
    const [start, setStart] = useState("2018-01-01");
    const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
    const [initialCash, setInitialCash] = useState(100_000);
    const [commissionBps, setCommBps] = useState(5);
    const [slippageBps, setSlipBps] = useState(5);
    const [riskFraction, setRiskFraction] = useState(1.0);
    // Derived
    const grouped = useMemo(() => groupByClass(assets), [assets]);
    const classes = useMemo(() => Object.keys(grouped), [grouped]);
    const classAssets = grouped[assetClass] ?? [];
    const selectedStrategy = strategies.find((s) => s.slug === strategySlug) ?? null;
    const years = yearsBetween(start, end);
    const barCount = Math.round(years * 252);
    // Load assets + strategies on mount
    useEffect(() => {
        Promise.all([Api.listAssets(), Api.listStrategies()])
            .then(([a, s]) => {
            setAssets(a);
            setStrategies(s);
            // Pre-select strategy from URL param (?strategy=slug)
            const slugParam = searchParams.get("strategy");
            const firstSlug = slugParam && s.find((x) => x.slug === slugParam)
                ? slugParam
                : s[0]?.slug ?? null;
            setStrategySlug(firstSlug);
            // Pre-select first asset class + symbol
            const groups = groupByClass(a);
            const firstClass = Object.keys(groups)[0] ?? "equity";
            setAssetClass(firstClass);
            setSymbol(groups[firstClass]?.[0]?.symbol ?? null);
        })
            .catch((e) => setError(String(e)));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // When asset class changes, reset symbol to first in that class
    useEffect(() => {
        setSymbol(classAssets[0]?.symbol ?? null);
    }, [assetClass]); // eslint-disable-line react-hooks/exhaustive-deps
    // Submit
    const submit = async () => {
        if (!symbol || !strategySlug)
            return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await Api.submitBacktest({
                asset_symbol: symbol,
                strategy_slug: strategySlug,
                start_date: new Date(start).toISOString(),
                end_date: new Date(end).toISOString(),
                params,
                initial_cash: initialCash,
                commission_bps: commissionBps,
                slippage_bps: slippageBps,
                risk_fraction: riskFraction,
            });
            navigate(`/backtests/${result.id}`);
        }
        catch (e) {
            const detail = e?.response?.data?.detail;
            setError(detail ?? String(e));
        }
        finally {
            setSubmitting(false);
        }
    };
    // ── Loading screen while submitting ───────────────────────────────────────
    if (submitting) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center h-[70vh] gap-6", children: [_jsx("div", { className: "font-mono text-[11px] text-ink-muted tracking-[2px] uppercase", children: "Running Backtest" }), _jsxs("div", { className: "font-mono text-accent-cyan text-base", children: ["Simulating ", selectedStrategy?.name, " on ", symbol, "..."] }), _jsx("div", { className: "w-72 h-[3px] bg-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-accent-cyan rounded-full animate-pulse w-3/5" }) }), _jsxs("div", { className: "font-mono text-xs text-ink-muted", children: [symbol, " \u00B7 ", start.slice(0, 4), "\u2013", end.slice(0, 4)] })] }));
    }
    return (_jsxs("div", { className: "px-10 py-8 pb-16", children: [_jsxs("div", { className: "mb-7", children: [_jsx(Link, { to: "/strategies", className: "font-mono text-[11px] text-ink-muted hover:text-ink-primary transition-colors mb-3 inline-block", children: "\u2190 Back to Library" }), _jsx("h2", { className: "text-ink-primary", children: "Configure Backtest" }), selectedStrategy && (_jsxs("p", { className: "text-ink-muted text-sm mt-1", children: ["Set parameters for", " ", _jsx("span", { className: "text-accent-cyan font-medium", children: selectedStrategy.name })] }))] }), error && (_jsx("div", { className: "card border-accent-red text-accent-red text-sm mb-6", children: error })), _jsxs("div", { className: "flex gap-7 items-start", children: [_jsxs("div", { className: "flex-1 min-w-0 flex flex-col gap-4", children: [_jsxs(Section, { title: "Strategy", children: [_jsx("select", { className: "input-base", value: strategySlug ?? "", onChange: (e) => setStrategySlug(e.target.value), children: strategies.map((s) => (_jsx("option", { value: s.slug, children: s.name }, s.slug))) }), selectedStrategy && (_jsx("p", { className: "text-[12px] text-ink-muted mt-2 leading-relaxed", children: selectedStrategy.description }))] }), _jsx(Section, { title: "Asset Class", children: _jsx("div", { className: "flex gap-2 flex-wrap", children: classes.map((cls) => (_jsx("button", { onClick: () => setAssetClass(cls), className: `px-4 py-1.5 rounded-md border text-[13px] transition-all ${assetClass === cls
                                            ? "bg-accent-cyan border-accent-cyan text-base font-semibold"
                                            : "border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border"}`, children: cls.charAt(0).toUpperCase() + cls.slice(1) }, cls))) }) }), _jsx(Section, { title: "Instrument", children: classAssets.length === 0 ? (_jsx("div", { className: "text-ink-muted text-sm", children: "Loading assets..." })) : (_jsx("div", { className: "grid gap-2", style: { gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }, children: classAssets.map((a) => (_jsxs("button", { onClick: () => setSymbol(a.symbol), className: `flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-md border text-left transition-all ${symbol === a.symbol
                                            ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10"
                                            : "border-border-subtle text-ink-primary hover:border-border"}`, children: [_jsx("span", { className: "font-mono text-[13px] font-semibold", children: a.symbol }), _jsx("span", { className: "text-[11px] text-ink-muted", children: a.name })] }, a.symbol))) })) }), _jsx(Section, { title: "Backtest Period", children: _jsxs("div", { className: "flex items-end gap-4 flex-wrap", children: [_jsxs("div", { className: "flex-1 min-w-[140px]", children: [_jsx("label", { className: "label-base", children: "Start Date" }), _jsx("input", { type: "date", className: "input-base", value: start, onChange: (e) => setStart(e.target.value) })] }), _jsxs("div", { className: "flex-1 min-w-[140px]", children: [_jsx("label", { className: "label-base", children: "End Date" }), _jsx("input", { type: "date", className: "input-base", value: end, onChange: (e) => setEnd(e.target.value) })] }), years > 0 && (_jsxs("div", { className: "font-mono text-[12px] text-ink-muted pb-2 whitespace-nowrap", children: [years.toFixed(1), " yrs \u00B7 ~", barCount.toLocaleString(), " bars"] }))] }) }), _jsx(Section, { title: "Strategy Parameters", children: selectedStrategy ? (_jsx(StrategyConfigForm, { schema: selectedStrategy.params_schema, onChange: setParams })) : (_jsx("div", { className: "text-sm text-ink-muted", children: "Select a strategy to see its parameters." })) })] }), _jsxs("div", { className: "flex-shrink-0 w-[280px] flex flex-col gap-4", children: [_jsxs("div", { className: "card space-y-4", children: [_jsx("div", { className: "section-title", children: "Execution Settings" }), _jsx(NumField, { label: "Initial Capital ($)", value: initialCash, onChange: setInitialCash, step: 10000, min: 1000, hint: "Starting portfolio value" }), _jsx(NumField, { label: "Commission (bps)", value: commissionBps, onChange: setCommBps, step: 0.5, min: 0, hint: "Per trade, per leg" }), _jsx(NumField, { label: "Slippage (bps)", value: slippageBps, onChange: setSlipBps, step: 0.5, min: 0, hint: "Market impact cost" }), _jsx(NumField, { label: "Risk Fraction", value: riskFraction, onChange: setRiskFraction, step: 0.05, min: 0, max: 1, hint: "Fraction of equity per position" })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "section-title", children: "Summary" }), _jsx("div", { className: "flex flex-col divide-y divide-border", children: [
                                            { label: "Strategy", val: selectedStrategy?.name ?? "—" },
                                            { label: "Asset", val: symbol ?? "—" },
                                            { label: "Period", val: years > 0 ? `${start.slice(0, 4)} – ${end.slice(0, 4)}` : "—" },
                                            { label: "Comm.", val: `${commissionBps} bps` },
                                            { label: "Slippage", val: `${slippageBps} bps` },
                                            { label: "Capital", val: `$${initialCash.toLocaleString()}` },
                                        ].map((r) => (_jsxs("div", { className: "flex justify-between items-center py-2", children: [_jsx("span", { className: "text-ink-muted text-[12px]", children: r.label }), _jsx("span", { className: "font-mono text-[12px] text-ink-primary", children: r.val })] }, r.label))) })] }), _jsx("button", { className: "w-full py-3.5 rounded-lg bg-accent-cyan text-base font-bold text-[15px]\n                       hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition", onClick: submit, disabled: !symbol || !strategySlug, children: "Run Backtest" }), _jsx("p", { className: "text-center font-mono text-[11px] text-ink-muted -mt-2", children: "~2s simulation time" })] })] })] }));
}
// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
    return (_jsxs("div", { className: "card space-y-3", children: [_jsx("div", { className: "section-title", children: title }), children] }));
}
// ── Number input field ────────────────────────────────────────────────────────
function NumField({ label, value, onChange, step = 1, min, max, hint, }) {
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-1.5", children: [_jsx("label", { className: "label-base mb-0", children: label }), _jsx("span", { className: "font-mono text-[12px] text-accent-cyan", children: label.includes("$") || label.includes("Capital")
                            ? `$${Number(value).toLocaleString()}`
                            : value })] }), _jsx("input", { type: "number", className: "input-base", value: value, step: step, min: min, max: max, onChange: (e) => onChange(parseFloat(e.target.value)) }), hint && _jsx("div", { className: "text-[11px] text-ink-muted mt-1", children: hint })] }));
}
