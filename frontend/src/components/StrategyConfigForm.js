import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * StrategyConfigForm — renders a form from a strategy's JSON Schema.
 * Walks schema.properties and renders an input per field.
 * Supports number, integer, boolean, string, enum.
 */
import { useEffect, useMemo, useState } from "react";
export function StrategyConfigForm({ schema, onChange, }) {
    const initial = useMemo(() => extractDefaults(schema), [schema]);
    const [values, setValues] = useState(initial);
    useEffect(() => {
        setValues(initial);
        onChange(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schema]);
    const update = (k, v) => {
        const next = { ...values, [k]: v };
        setValues(next);
        onChange(next);
    };
    const props = schema.properties ?? {};
    const keys = Object.keys(props);
    if (keys.length === 0) {
        return (_jsx("div", { className: "text-xs text-ink-muted", children: "This strategy has no configurable parameters." }));
    }
    return (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: keys.map((key) => {
            const sub = props[key];
            return (_jsxs("div", { children: [_jsx("label", { className: "label-base", children: sub.title ?? key }), renderField(key, sub, values[key], update), sub.description && (_jsx("p", { className: "text-[11px] text-ink-muted mt-1", children: sub.description }))] }, key));
        }) }));
}
function extractDefaults(schema) {
    const out = {};
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
        if (sub.default !== undefined)
            out[k] = sub.default;
    }
    return out;
}
function renderField(key, sub, value, update) {
    if (sub.enum) {
        return (_jsx("select", { className: "input-base", value: String(value ?? ""), onChange: (e) => update(key, e.target.value), children: sub.enum.map((opt) => (_jsx("option", { value: String(opt), children: String(opt) }, String(opt)))) }));
    }
    switch (sub.type) {
        case "boolean":
            return (_jsx("input", { type: "checkbox", checked: Boolean(value), onChange: (e) => update(key, e.target.checked), className: "w-4 h-4 accent-accent-cyan" }));
        case "integer":
        case "number":
            return (_jsx("input", { type: "number", className: "input-base", value: value === undefined ? "" : Number(value), min: sub.minimum, max: sub.maximum, step: sub.type === "integer" ? 1 : 0.01, onChange: (e) => update(key, sub.type === "integer"
                    ? parseInt(e.target.value, 10)
                    : parseFloat(e.target.value)) }));
        case "string":
        default:
            return (_jsx("input", { type: "text", className: "input-base", value: String(value ?? ""), onChange: (e) => update(key, e.target.value) }));
    }
}
