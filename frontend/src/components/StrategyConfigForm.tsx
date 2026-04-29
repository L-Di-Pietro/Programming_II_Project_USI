/**
 * StrategyConfigForm — renders a form from a strategy's JSON Schema.
 *
 * The backend exposes each strategy's `params_schema` (JSON Schema dump of
 * the Pydantic config model). We walk the schema and render an input per
 * property. Supports number, integer, boolean, and string today; extending
 * to enum / arrays is straightforward.
 */
import { useEffect, useMemo, useState } from "react";

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
    return <div className="text-xs text-slate-500">This strategy has no configurable parameters.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {keys.map((key) => {
        const sub = props[key];
        return (
          <div key={key}>
            <label className="label-base">{sub.title ?? key}</label>
            {renderField(key, sub, values[key], update)}
            {sub.description && (
              <p className="text-[11px] text-slate-500 mt-1">{sub.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
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
  // Enums → select.
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
          className="w-4 h-4"
        />
      );
    case "integer":
    case "number":
      return (
        <input
          type="number"
          className="input-base"
          value={value === undefined ? "" : Number(value)}
          min={sub.minimum}
          max={sub.maximum}
          step={sub.type === "integer" ? 1 : 0.01}
          onChange={(e) =>
            update(key, sub.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))
          }
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
