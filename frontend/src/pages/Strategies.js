import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Api } from "@/api/client";
const STRATEGY_META = {
    "sma-crossover": {
        abbr: "SMA-X",
        complexity: 1,
        badge: "Classic",
        assets: ["Equities", "FX", "Crypto"],
        profile: { cagr: 0.12, winRate: 0.42 },
    },
    "rsi-mean-reversion": {
        abbr: "RSI-MR",
        complexity: 1,
        badge: "Popular",
        assets: ["Equities", "Crypto"],
        profile: { cagr: 0.19, winRate: 0.62 },
    },
    "bollinger-bands": {
        abbr: "BB",
        complexity: 2,
        badge: null,
        assets: ["Equities", "FX", "Crypto"],
        profile: { cagr: 0.11, winRate: 0.55 },
    },
    "donchian-breakout": {
        abbr: "DON",
        complexity: 1,
        badge: "Turtle",
        assets: ["Equities", "FX", "Crypto"],
        profile: { cagr: 0.17, winRate: 0.35 },
    },
};
const COMPLEXITY_LABEL = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };
const COMPLEXITY_COLOR = {
    1: "text-accent-green",
    2: "text-accent-amber",
    3: "text-accent-red",
};
const CATEGORIES = ["All", "Trend Following", "Mean Reversion"];
// ── Component ─────────────────────────────────────────────────────────────────
export function Strategies() {
    const navigate = useNavigate();
    const [strategies, setStrategies] = useState([]);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState("All");
    const [hovered, setHovered] = useState(null);
    useEffect(() => {
        Api.listStrategies().then(setStrategies).catch((e) => setError(String(e)));
    }, []);
    const filtered = filter === "All"
        ? strategies
        : strategies.filter((s) => s.category === filter);
    return (_jsxs("div", { className: "px-10 py-10 pb-16", children: [_jsxs("div", { className: "mb-7", children: [_jsx("h2", { className: "text-ink-primary mb-2", children: "Strategy Library" }), _jsxs("p", { className: "text-ink-muted text-sm", children: [strategies.length, " institutional-grade quant strategies. Select one to configure and backtest."] })] }), error && (_jsx("div", { className: "card border-accent-red text-accent-red text-sm mb-6", children: error })), _jsxs("div", { className: "flex items-center gap-2 mb-7 flex-wrap", children: [CATEGORIES.map((c) => (_jsx("button", { onClick: () => setFilter(c), className: `px-4 py-1.5 rounded-full border text-[13px] transition-all ${filter === c
                            ? "bg-accent-cyan border-accent-cyan text-base font-semibold"
                            : "border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border"}`, children: c }, c))), _jsxs("span", { className: "ml-auto font-mono text-[12px] text-ink-muted", children: [filtered.length, " ", filtered.length === 1 ? "strategy" : "strategies"] })] }), _jsxs("div", { className: "grid gap-4", style: { gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }, children: [filtered.map((s) => {
                        const meta = STRATEGY_META[s.slug];
                        const isHovered = hovered === s.slug;
                        return (_jsxs("div", { onMouseEnter: () => setHovered(s.slug), onMouseLeave: () => setHovered(null), onClick: () => navigate(`/backtests/new?strategy=${s.slug}`), className: `flex flex-col gap-3 rounded-lg p-5 border cursor-pointer transition-all ${isHovered
                                ? "border-accent-cyan bg-surface"
                                : "border-border-subtle bg-base"}`, children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsx("span", { className: `tag-mono border-accent-cyan text-accent-cyan ${isHovered ? "bg-accent-cyan/10" : ""}`, children: meta?.abbr ?? s.slug.toUpperCase() }), meta?.badge && (_jsx("span", { className: `tag-mono transition-colors ${isHovered
                                                ? "border-accent-cyan text-accent-cyan"
                                                : "border-border-subtle text-ink-muted"}`, children: meta.badge }))] }), _jsxs("div", { children: [_jsx("h3", { className: "text-ink-primary text-[15px] font-semibold mb-0.5", children: s.name }), meta && (_jsx("span", { className: `font-mono text-[11px] ${COMPLEXITY_COLOR[meta.complexity]}`, children: s.category }))] }), _jsx("p", { className: "text-ink-muted text-[13px] leading-relaxed flex-1", children: s.description }), meta && (_jsxs("div", { className: "flex border-t border-b border-border py-2.5 gap-0", children: [_jsx(MetaStat, { label: "CAGR (hist.)", value: `~${(meta.profile.cagr * 100).toFixed(0)}%`, valueClass: "text-accent-green" }), _jsx(MetaStat, { label: "Win Rate", value: `${(meta.profile.winRate * 100).toFixed(0)}%` }), _jsx(MetaStat, { label: "Level", value: COMPLEXITY_LABEL[meta.complexity], valueClass: COMPLEXITY_COLOR[meta.complexity] })] })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "flex gap-1.5 flex-wrap", children: (meta?.assets ?? []).map((a) => (_jsx("span", { className: "font-mono text-[10px] text-ink-muted border border-border-subtle rounded px-2 py-0.5", children: a }, a))) }), _jsx("span", { className: `font-mono text-[11px] tracking-wider transition-colors ${isHovered ? "text-accent-cyan" : "text-ink-muted"}`, children: "SELECT" })] })] }, s.slug));
                    }), strategies.length === 0 && !error && (_jsx("div", { className: "card text-ink-muted text-sm col-span-full text-center py-10", children: "Loading strategies..." }))] })] }));
}
// ── Inline helper ─────────────────────────────────────────────────────────────
function MetaStat({ label, value, valueClass = "text-ink-primary", }) {
    return (_jsxs("div", { className: "flex-1 flex flex-col gap-1 pr-3", children: [_jsx("span", { className: "font-mono text-[10px] uppercase tracking-wider text-ink-muted", children: label }), _jsx("span", { className: `font-mono text-sm font-semibold ${valueClass}`, children: value })] }));
}
