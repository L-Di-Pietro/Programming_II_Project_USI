import { jsx as _jsx } from "react/jsx-runtime";
import Plot from "react-plotly.js";
import { ChartEmpty } from "@/components/EquityCurve";
const DARK_LAYOUT = {
    paper_bgcolor: "#161b22",
    plot_bgcolor: "#0d1117",
    font: { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
    xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
    yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d", tickprefix: "$" },
    margin: { t: 16, r: 16, b: 40, l: 70 },
    showlegend: false,
};
export function TradePnlChart({ trades }) {
    if (!trades || trades.length === 0) {
        return _jsx(ChartEmpty, { label: "No trades yet." });
    }
    const wins = trades.map((t, i) => ({ i, v: t.net_pnl })).filter((x) => x.v > 0);
    const losses = trades.map((t, i) => ({ i, v: t.net_pnl })).filter((x) => x.v <= 0);
    const data = [
        {
            type: "scatter",
            mode: "markers",
            x: wins.map((x) => x.i),
            y: wins.map((x) => x.v),
            name: "Win",
            marker: { color: "#3fb950", size: 6 },
            hovertemplate: "Trade #%{x}<br>P&L: $%{y:,.2f}<extra></extra>",
        },
        {
            type: "scatter",
            mode: "markers",
            x: losses.map((x) => x.i),
            y: losses.map((x) => x.v),
            name: "Loss",
            marker: { color: "#f85149", size: 6 },
            hovertemplate: "Trade #%{x}<br>P&L: $%{y:,.2f}<extra></extra>",
        },
    ];
    const layout = {
        ...DARK_LAYOUT,
        shapes: [
            {
                type: "line",
                xref: "paper",
                yref: "y",
                x0: 0, x1: 1, y0: 0, y1: 0,
                line: { color: "#30363d", width: 1, dash: "dot" },
            },
        ],
    };
    return (_jsx(Plot, { data: data, layout: layout, useResizeHandler: true, style: { width: "100%", height: "320px" }, config: { displaylogo: false, responsive: true, displayModeBar: false } }));
}
