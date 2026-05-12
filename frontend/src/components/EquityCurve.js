import { jsx as _jsx } from "react/jsx-runtime";
import Plot from "react-plotly.js";
const DARK_LAYOUT = {
    paper_bgcolor: "#161b22",
    plot_bgcolor: "#0d1117",
    font: { color: "#7d8590", family: "JetBrains Mono, monospace", size: 11 },
    xaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
    yaxis: { gridcolor: "rgba(255,255,255,0.04)", linecolor: "#30363d", tickcolor: "#30363d", zerolinecolor: "#30363d" },
    margin: { t: 16, r: 16, b: 40, l: 60 },
    showlegend: true,
    legend: { x: 1, xanchor: "right", y: 1, yanchor: "top", bgcolor: "rgba(0,0,0,0)", font: { size: 11 } },
};
/** Pure Plotly wrapper — card chrome is handled by the parent tab panel. */
export function EquityCurve({ figure }) {
    if (!figure) {
        return _jsx(ChartEmpty, { label: "No equity data yet." });
    }
    return (_jsx(Plot, { data: figure.data, layout: { ...figure.layout, ...DARK_LAYOUT }, useResizeHandler: true, style: { width: "100%", height: "320px" }, config: { displaylogo: false, responsive: true, displayModeBar: false } }));
}
export function ChartEmpty({ label }) {
    return (_jsx("div", { className: "flex items-center justify-center h-[320px] text-ink-muted text-sm font-mono", children: label }));
}
