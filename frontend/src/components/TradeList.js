import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
const PAGE_SIZE = 12;
const COLUMNS = [
    { label: "#", key: "id" },
    { label: "Date", key: "ts" },
    { label: "Side", key: "side" },
    { label: "Qty", key: "qty", right: true },
    { label: "Price", key: "price", right: true },
    { label: "Comm.", key: "commission", right: true },
    { label: "Net PnL", key: "net_pnl", right: true },
];
export function TradeList({ trades }) {
    const [page, setPage] = useState(0);
    const [sortKey, setSortKey] = useState("id");
    const [sortDir, setSortDir] = useState(1);
    const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
    const sorted = [...trades].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null || bv == null)
            return 0;
        if (typeof av === "string" && typeof bv === "string")
            return sortDir * av.localeCompare(bv);
        return sortDir * (av - bv);
    });
    const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    function toggleSort(key) {
        if (sortKey === key)
            setSortDir((d) => (d === 1 ? -1 : 1));
        else {
            setSortKey(key);
            setSortDir(1);
        }
    }
    return (_jsxs("div", { className: "border border-border rounded-lg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-3.5 border-b border-border", children: [_jsx("span", { className: "font-mono text-[10px] uppercase tracking-widest text-ink-muted", children: "Trade Log" }), _jsxs("span", { className: "font-mono text-[11px] text-ink-muted", children: [trades.length, " trade", trades.length === 1 ? "" : "s", " \u00B7 page ", page + 1, "/", totalPages] })] }), _jsx("div", { className: "grid px-5 py-2.5 border-b border-border bg-surface", style: { gridTemplateColumns: "0.5fr 1fr 0.8fr 1fr 1fr 0.9fr 1fr" }, children: COLUMNS.map((col) => (_jsxs("button", { onClick: () => toggleSort(col.key), className: `font-mono text-[10px] uppercase tracking-wider text-left hover:text-ink-primary transition-colors ${col.right ? "text-right" : ""} ${sortKey === col.key ? "text-accent-cyan" : "text-ink-muted"}`, children: [col.label, sortKey === col.key && (_jsx("span", { className: "ml-0.5", children: sortDir > 0 ? " ↑" : " ↓" }))] }, col.key))) }), slice.length === 0 && (_jsx("div", { className: "px-5 py-10 text-center text-ink-muted text-sm font-mono", children: "No trades." })), slice.map((t) => {
                const isWin = t.net_pnl > 0;
                return (_jsxs("div", { className: "grid px-5 py-2.5 border-b border-border hover:bg-white/[0.02] transition-colors", style: {
                        gridTemplateColumns: "0.5fr 1fr 0.8fr 1fr 1fr 0.9fr 1fr",
                        borderLeft: `2px solid ${isWin ? "rgba(63,185,80,0.35)" : "rgba(248,81,73,0.35)"}`,
                    }, children: [_jsx("span", { className: "font-mono text-[12px] text-ink-muted", children: t.id }), _jsx("span", { className: "font-mono text-[12px] text-ink-muted", children: new Date(t.ts).toISOString().slice(0, 10) }), _jsx("span", { className: `font-mono text-[12px] font-bold ${t.side === "buy" ? "text-accent-green" : "text-accent-red"}`, children: t.side.toUpperCase() }), _jsx("span", { className: "font-mono text-[12px] text-ink-primary text-right", children: t.qty.toFixed(4) }), _jsxs("span", { className: "font-mono text-[12px] text-ink-primary text-right", children: ["$", t.price.toFixed(2)] }), _jsxs("span", { className: "font-mono text-[12px] text-ink-muted text-right", children: ["$", t.commission.toFixed(2)] }), _jsxs("span", { className: `font-mono text-[12px] font-bold text-right ${isWin ? "text-accent-green" : "text-accent-red"}`, children: [t.net_pnl >= 0 ? "+" : "", "$", t.net_pnl.toFixed(2)] })] }, t.id));
            }), totalPages > 1 && (_jsxs("div", { className: "flex items-center justify-center gap-6 px-5 py-3.5", children: [_jsx("button", { className: "btn-ghost text-xs font-mono", disabled: page === 0, onClick: () => setPage((p) => p - 1), children: "< Prev" }), _jsxs("span", { className: "font-mono text-[12px] text-ink-muted", children: [page + 1, " / ", totalPages] }), _jsx("button", { className: "btn-ghost text-xs font-mono", disabled: page + 1 >= totalPages, onClick: () => setPage((p) => p + 1), children: "Next >" })] }))] }));
}
