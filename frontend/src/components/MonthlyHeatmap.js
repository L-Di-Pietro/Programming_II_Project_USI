import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function cellBg(v) {
    if (v === null)
        return "transparent";
    const alpha = (Math.min(Math.abs(v) / 10, 1) * 0.85 + 0.10).toFixed(2);
    return v >= 0
        ? `rgba(63, 185, 80, ${alpha})`
        : `rgba(248, 81, 73, ${alpha})`;
}
function fmt(v) {
    if (v === null)
        return "—";
    return (v >= 0 ? "+" : "") + v.toFixed(1);
}
function computeReturns(data) {
    const monthly = {};
    for (const pt of data) {
        const d = new Date(pt.ts);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        if (!monthly[y])
            monthly[y] = {};
        if (!monthly[y][m]) {
            monthly[y][m] = { first: pt.equity, last: pt.equity };
        }
        else {
            monthly[y][m].last = pt.equity;
        }
    }
    const years = Object.keys(monthly).map(Number).sort();
    const annual = {};
    for (const y of years) {
        const pts = data.filter((pt) => new Date(pt.ts).getFullYear() === y);
        annual[y] = pts.length >= 2
            ? (pts[pts.length - 1].equity / pts[0].equity - 1) * 100
            : null;
    }
    const returns = {};
    for (const y of years) {
        returns[y] = {};
        for (let m = 1; m <= 12; m++) {
            const cell = monthly[y]?.[m];
            returns[y][m] = cell ? (cell.last / cell.first - 1) * 100 : null;
        }
    }
    return { years, returns, annual };
}
const thStyle = {
    padding: "4px 8px",
    textAlign: "center",
    color: "#7d8590",
    fontWeight: 400,
    borderBottom: "1px solid #21262d",
};
const tdStyle = {
    padding: "3px 6px",
    textAlign: "center",
    minWidth: 46,
    borderRadius: 3,
};
export function MonthlyHeatmap({ equityData }) {
    if (!equityData || equityData.length === 0) {
        return (_jsx("div", { className: "flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono", children: "No equity data yet." }));
    }
    const { years, returns, annual } = computeReturns(equityData);
    return (_jsx("div", { className: "overflow-x-auto px-5 py-4", style: { background: "#0d1117" }, children: _jsxs("table", { style: { borderCollapse: "collapse", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#c9d1d9", width: "100%" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: thStyle }), MONTH_LABELS.map((m) => (_jsx("th", { style: thStyle, children: m }, m))), _jsx("th", { style: { ...thStyle, color: "#7d8590" }, children: "Ann." })] }) }), _jsx("tbody", { children: years.map((y) => (_jsxs("tr", { children: [_jsx("td", { style: { ...tdStyle, color: "#7d8590", textAlign: "left", paddingLeft: 6 }, children: y }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                                const v = returns[y][m] ?? null;
                                return (_jsx("td", { style: { ...tdStyle, background: cellBg(v), color: v === null ? "#30363d" : "#e6edf3" }, children: fmt(v) }, m));
                            }), _jsx("td", { style: { ...tdStyle, background: cellBg(annual[y] ?? null), color: "#e6edf3", fontWeight: 700 }, children: fmt(annual[y] ?? null) })] }, y))) })] }) }));
}
