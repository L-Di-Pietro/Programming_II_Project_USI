import { useEffect, useMemo, useRef, useState } from "react";

// ── Date parsing + clamping ─────────────────────────────────────────────────────
function clampISO(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/**
 * Parse free-typed input into a clamped ISO yyyy-mm-dd. Accepts a full date
 * (forgiving separators / widths, or yyyymmdd) or a bare year (→ Jan 1).
 * Unparseable or impossible dates revert to `fallback`, so the field never
 * commits garbage; valid dates are clamped into [min, max].
 */
function normalizeDate(raw: string, fallback: string, min?: string, max?: string): string {
  const s = raw.trim();
  if (/^\d{1,4}$/.test(s)) return clampISO(`${s.padStart(4, "0")}-01-01`, min, max);
  const m =
    s.match(/^(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})$/) ?? s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return fallback;
  const iso = `${m[1].padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return fallback;
  return clampISO(iso, min, max);
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** 42-day (6-week) grid for a month, starting on the Sunday on/before the 1st. */
function monthGrid(year: number, month0: number): DayCell[] {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const start = Date.UTC(year, month0, 1 - firstDow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    return {
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month0,
    };
  });
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Build an `isPresent(iso)` from sorted, non-overlapping [start, end] ranges. */
function makeIsPresent(ranges?: [string, string][]): (iso: string) => boolean {
  if (!ranges || ranges.length === 0) return () => true; // no data → don't dot anything
  return (iso: string) => {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const [s, e] = ranges[mid];
      if (iso < s) hi = mid - 1;
      else if (iso > e) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

/**
 * Backtest-period date field: a typeable text input (robust against
 * mid-typing resets in every browser) plus a themed calendar popup. Typed
 * input is parsed/clamped to [min, max] on blur; picking a day commits it
 * directly. Out-of-range days are greyed and non-selectable. The "Run
 * Backtest" click blurs the field first, so submit reads the committed value.
 */
export function DateField({
  label, value, min, max, ranges, onCommit,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  /** RLE present-day ranges; in-range days outside these are marked "no data". */
  ranges?: [string, string][];
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft]     = useState(value);
  const [focused, setFocused] = useState(false);
  const [open, setOpen]       = useState(false);
  // Month shown in the calendar, as the first-of-month ISO.
  const [view, setView]       = useState(() => firstOfMonth(value));
  const ref = useRef<HTMLDivElement>(null);

  // Pull external changes in (initial load, asset/timeframe snap) only while the
  // user isn't editing, so we never clobber in-progress input.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  // Open the calendar on the selected value's month.
  useEffect(() => {
    if (open) setView(firstOfMonth(value));
  }, [open, value]);

  // Close on outside-click or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = () => {
    setFocused(false);
    const next = normalizeDate(draft, value, min, max);
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  const [vy, vm] = [Number(view.slice(0, 4)), Number(view.slice(5, 7)) - 1];
  const cells = useMemo(() => monthGrid(vy, vm), [vy, vm]);
  const isPresent = useMemo(() => makeIsPresent(ranges), [ranges]);
  const shiftMonth = (delta: number) =>
    setView(new Date(Date.UTC(vy, vm + delta, 1)).toISOString().slice(0, 10));
  // Disable nav once the visible month is entirely outside the data range.
  const prevDisabled = !!min && view <= firstOfMonth(min);
  const nextDisabled = !!max && view >= firstOfMonth(max);

  const pick = (iso: string) => {
    setDraft(iso);
    setOpen(false);
    if (iso !== value) onCommit(iso);
  };

  return (
    <div className="flex-1 min-w-[140px]">
      <label className="label-base">{label}</label>
      <div ref={ref} className="relative">
        <input
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          className="input-base pr-9"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Open calendar"
          title="Open calendar"
          className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
            open ? "text-accent-cyan" : "text-ink-muted hover:text-accent-cyan"
          }`}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2" y="3" width="12" height="11" rx="1.5" />
            <path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[252px] bg-surface border border-border rounded-lg shadow-xl p-3 cursor-default">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <NavButton dir="prev" disabled={prevDisabled} onClick={() => shiftMonth(-1)} />
              <span className="text-[13px] font-medium text-ink-primary">
                {MONTHS[vm]} {vy}
              </span>
              <NavButton dir="next" disabled={nextDisabled} onClick={() => shiftMonth(1)} />
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-[10px] text-ink-muted text-center uppercase tracking-wide py-0.5">
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c) => {
                const outOfRange = (!!min && c.iso < min) || (!!max && c.iso > max);
                const selected = c.iso === value;
                // In-range day with no bar (weekend / holiday / gap) — still
                // selectable, but flagged with a dot so absent data is visible.
                const missing = !outOfRange && !selected && !isPresent(c.iso);
                return (
                  <button
                    key={c.iso}
                    type="button"
                    disabled={outOfRange}
                    onClick={() => pick(c.iso)}
                    title={missing ? "No data for this day" : undefined}
                    className={`relative h-7 rounded text-[12px] flex items-center justify-center transition-colors ${
                      outOfRange
                        ? "text-ink-muted/30 cursor-not-allowed"
                        : selected
                          ? "bg-accent-cyan text-[#0d1117] font-semibold"
                          : missing
                            ? "text-ink-muted/60 hover:bg-white/[0.06]"
                            : `${c.inMonth ? "text-ink-primary" : "text-ink-muted"} hover:bg-white/[0.06]`
                    }`}
                  >
                    {c.day}
                    {missing && (
                      <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-ink-muted/50" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-border text-[10px] text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <span className="relative w-3 inline-flex justify-center">
                  <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-ink-muted/50" />
                </span>
                no data
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-ink-muted/30">15</span> out of range
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
        disabled ? "text-ink-muted/30 cursor-not-allowed" : "text-ink-muted hover:text-accent-cyan hover:bg-white/[0.06]"
      }`}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d={dir === "prev" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
