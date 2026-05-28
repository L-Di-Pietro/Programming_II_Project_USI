/**
 * StrategyConfigForm — renders a form from a strategy's JSON Schema.
 * Walks schema.properties and renders an input per field.
 * Supports number, integer, boolean, string, enum.
 */
import { useEffect, useMemo, useState } from "react";

import { clamp, formatRange } from "@/utils/apiError";

interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  title?: string;
}

export function StrategyConfigForm({
  schema,
  onChange,
}: {
  schema: JSONSchema;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const initial = useMemo(() => extractDefaults(schema), [schema]);
  const [values, setValues] = useState<Record<string, unknown>>(initial);

  useEffect(() => {
    setValues(initial);
    onChange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const update = (k: string, v: unknown) => {
    const next = { ...values, [k]: v };
    setValues(next);
    onChange(next);
  };

  const props = schema.properties ?? {};
  const keys = Object.keys(props);

  if (keys.length === 0) {
    return (
      <div className="text-xs text-ink-muted">
        This strategy has no configurable parameters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {keys.map((key) => {
        const sub = props[key];
        const isNumeric = sub.type === "number" || sub.type === "integer";
        const range = isNumeric ? formatRange(sub.minimum, sub.maximum) : "";
        return (
          <div key={key}>
            <label className="label-base">{sub.title ?? key}</label>
            {renderField(key, sub, values[key], update)}
            {(sub.description || range) && (
              <p className="text-[11px] text-ink-muted mt-1">
                {sub.description}
                {sub.description && range && " · "}
                {range && <span>Range: {range}</span>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function extractDefaults(schema: JSONSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, sub] of Object.entries(schema.properties ?? {})) {
    if (sub.default !== undefined) out[k] = sub.default;
  }
  return out;
}

function renderField(
  key: string,
  sub: JSONSchema,
  value: unknown,
  update: (k: string, v: unknown) => void,
) {
  if (sub.enum) {
    return (
      <select
        className="input-base"
        value={String(value ?? "")}
        onChange={(e) => update(key, e.target.value)}
      >
        {sub.enum.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
    );
  }

  switch (sub.type) {
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => update(key, e.target.checked)}
          className="w-4 h-4 accent-accent-cyan"
        />
      );
    case "integer":
    case "number":
      return (
        <input
          type="number"
          className="input-base"
          value={value === undefined || !Number.isFinite(value as number) ? "" : Number(value)}
          min={sub.minimum}
          max={sub.maximum}
          step={sub.type === "integer" ? 1 : 0.01}
          onChange={(e) => {
            if (e.target.value === "") { update(key, undefined); return; }
            const n = sub.type === "integer"
              ? parseInt(e.target.value, 10)
              : parseFloat(e.target.value);
            if (Number.isFinite(n)) update(key, n);
          }}
          onBlur={() => {
            const n = value as number;
            if (!Number.isFinite(n)) return;
            const c = clamp(n, sub.minimum, sub.maximum);
            if (c !== n) update(key, sub.type === "integer" ? Math.round(c) : c);
          }}
        />
      );
    case "string":
    default:
      return (
        <input
          type="text"
          className="input-base"
          value={String(value ?? "")}
          onChange={(e) => update(key, e.target.value)}
        />
      );
  }
}
