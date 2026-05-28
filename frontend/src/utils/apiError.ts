// Normalize errors from the backend into a renderable string.
// FastAPI/Pydantic 422 returns `detail` as an array of error objects, which is
// NOT a valid React child — rendering it directly crashes the tree.

interface PydanticError {
  loc?: unknown[];
  msg?: string;
  type?: string;
}

export function formatApiError(e: unknown): string {
  const err = e as {
    response?: { data?: { detail?: unknown } };
    message?: string;
  } | undefined;
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: PydanticError) => {
        const loc = Array.isArray(d?.loc) ? d.loc.slice(1).join(".") : "";
        const msg = d?.msg ?? "Invalid value";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join("; ");
  }
  if (err?.message) return String(err.message);
  return String(e);
}

export function formatRange(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return `≥ ${min}`;
  if (max !== undefined) return `≤ ${max}`;
  return "";
}

export function clamp(v: number, min?: number, max?: number): number {
  if (!Number.isFinite(v)) return min ?? 0;
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}
