import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function AssetSelector({ assets, value, onChange, }) {
    const groups = groupByClass(assets);
    return (_jsxs("select", { className: "input-base", value: value ?? "", onChange: (e) => onChange(e.target.value), children: [_jsx("option", { value: "", disabled: true, children: "Choose an asset\u2026" }), Object.entries(groups).map(([cls, list]) => (_jsx("optgroup", { label: cls.toUpperCase(), children: list.map((a) => (_jsxs("option", { value: a.symbol, children: [a.symbol, " \u2014 ", a.name] }, a.symbol))) }, cls)))] }));
}
function groupByClass(assets) {
    return assets.reduce((acc, a) => {
        (acc[a.asset_class] ??= []).push(a);
        return acc;
    }, {});
}
