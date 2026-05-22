import type { BenchmarkKind } from "@/api/client";

import { BENCHMARKS } from "./benchmarks";

export type BenchmarkState = "idle" | "loading" | "error";

// Per-kind accent classes (static so Tailwind's JIT keeps them). Colours come
// from the accent.blue / accent.pink tokens.
const ACCENT: Record<BenchmarkKind, {
  onBorder: string;
  ringColor: string;
  offBorder: string;
  checkboxOn: string;
  checkboxOff: string;
}> = {
  buy_and_hold: {
    onBorder: "border-accent-blue",
    ringColor: "ring-accent-blue/30",
    offBorder: "border-accent-blue/25",
    checkboxOn: "bg-accent-blue border-accent-blue",
    checkboxOff: "border-accent-blue/50",
  },
  sp500: {
    onBorder: "border-accent-pink",
    ringColor: "ring-accent-pink/30",
    offBorder: "border-accent-pink/25",
    checkboxOn: "bg-accent-pink border-accent-pink",
    checkboxOff: "border-accent-pink/50",
  },
};

/**
 * The single page-level control for benchmark overlays. Toggling a pill on
 * lazily fetches that benchmark's data (handled by the parent); the pill shows
 * a spinner while loading and a tooltip if the benchmark is unavailable.
 */
export function BenchmarkToggleBar({
  active,
  state,
  onToggle,
}: {
  active: Set<BenchmarkKind>;
  state: Record<BenchmarkKind, BenchmarkState>;
  onToggle: (kind: BenchmarkKind) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {BENCHMARKS.map((b) => (
        <BenchmarkPill
          key={b.kind}
          kind={b.kind}
          label={b.label}
          sub={b.sub}
          on={active.has(b.kind)}
          state={state[b.kind]}
          onClick={() => onToggle(b.kind)}
        />
      ))}
    </div>
  );
}

function BenchmarkPill({
  kind, label, sub, on, state, onClick,
}: {
  kind: BenchmarkKind;
  label: string;
  sub: string;
  on: boolean;
  state: BenchmarkState;
  onClick: () => void;
}) {
  const accent = ACCENT[kind];
  const isError = state === "error";
  const isLoading = state === "loading";

  const borderClass = on
    ? `bg-surface ${accent.onBorder} ring-1 ring-inset ${accent.ringColor}`
    : isError
      ? "bg-transparent border-accent-red/40 hover:bg-white/[0.025]"
      : `bg-transparent ${accent.offBorder} hover:bg-white/[0.025]`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={
        isError
          ? `${label} data is unavailable for this run's date range.`
          : on ? `Hide ${label}` : `Show ${label}`
      }
      className={`group relative inline-flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-md border transition-colors ${borderClass}`}
    >
      <span className="relative inline-flex items-center justify-center w-4 h-4">
        {isLoading ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-muted border-t-transparent animate-spin" />
        ) : (
          <>
            <span
              className={`absolute inset-0 rounded-[3px] border transition-colors ${
                on ? accent.checkboxOn : isError ? "border-accent-red/50" : accent.checkboxOff
              }`}
            />
            {on && (
              <svg viewBox="0 0 14 14" className="relative w-2.5 h-2.5">
                <path
                  d="M2 7.5 L5.5 11 L12 3.5"
                  fill="none"
                  stroke="#0d1117"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </>
        )}
      </span>
      <div className="text-left leading-none">
        <div className="text-[12.5px] font-medium text-ink-primary">{label}</div>
        <div className="text-[10px] text-ink-muted mt-0.5">{isError ? "Unavailable" : sub}</div>
      </div>
    </button>
  );
}
