import type { BenchmarkKind } from "@/api/client";

import { BENCHMARKS } from "./benchmarks";

export type BenchmarkState = "idle" | "loading" | "error";

// Per-kind accent classes (static so Tailwind's JIT keeps them). Colours come
// from the accent.bh / accent.spx tokens.
const ACCENT: Record<BenchmarkKind, {
  onBorder: string;
  onBg: string;
  onDot: string;
  onSub: string;
}> = {
  buy_and_hold: {
    onBorder: "border-accent-bh",
    onBg: "bg-accent-bh/10",
    onDot: "bg-accent-bh",
    onSub: "text-accent-bh/70",
  },
  sp500: {
    onBorder: "border-accent-spx",
    onBg: "bg-accent-spx/10",
    onDot: "bg-accent-spx",
    onSub: "text-accent-spx/70",
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

  // border-2 in every state (only the colour changes) so toggling never
  // shifts layout by a pixel.
  const borderClass = on
    ? `${accent.onBg} ${accent.onBorder}`
    : isError
      ? "bg-transparent border-accent-red/50 hover:bg-white/[0.025]"
      : "bg-transparent border-border-subtle hover:bg-white/[0.025]";

  const dotClass = on
    ? accent.onDot
    : isError
      ? "bg-accent-red/50"
      : "bg-ink-muted/40";

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
      className={`group relative inline-flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-md border-2 transition-colors ${borderClass}`}
    >
      <span className="relative inline-flex items-center justify-center w-4 h-4">
        {isLoading ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-muted border-t-transparent animate-spin" />
        ) : (
          <span className={`w-2.5 h-2.5 rounded-[2px] transition-colors ${dotClass}`} />
        )}
      </span>
      <div className="text-left leading-none">
        <div className={`text-[12.5px] font-medium ${on ? "text-ink-primary" : "text-ink-muted"}`}>
          {label}
        </div>
        <div
          className={`text-[10px] mt-0.5 ${
            isError ? "text-accent-red/80" : on ? accent.onSub : "text-ink-muted"
          }`}
        >
          {isError ? "Unavailable" : sub}
        </div>
      </div>
    </button>
  );
}
