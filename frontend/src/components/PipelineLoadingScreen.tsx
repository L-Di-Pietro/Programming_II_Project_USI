import { useEffect, useState } from "react";

/**
 * Lightweight, finance-neutral loading screen: an uppercase mono heading, a
 * cyan status line that cycles through `messages` with a blinking cursor, and a
 * thin progress bar the caller drives. Used both for the Configure page's
 * initial data fetch and for the submit → Results redirect, so the two feel
 * like the same pipeline. Renders inside the content area (sidebar nav stays
 * visible) — not a fixed overlay.
 */
export function PipelineLoadingScreen({
  title,
  messages,
  progress,
  contextLine,
  cycleMs = 350,
}: {
  /** Uppercase heading, e.g. "Loading Configuration". */
  title: string;
  /** Status lines cycled through while loading. */
  messages: string[];
  /** Bar fill 0–100; caller eases it toward ~80 then snaps to 100 on done. */
  progress: number;
  /** Optional context line under the bar (e.g. strategy · symbol · period). */
  contextLine?: React.ReactNode;
  /** Status-line cycle interval in ms (spec: 300–400). */
  cycleMs?: number;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => setStepIndex((i) => (i + 1) % messages.length), cycleMs);
    return () => clearInterval(t);
  }, [messages.length, cycleMs]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[78vh] bg-base px-6">
      {/* 1. Header */}
      <div className="font-mono text-[11px] uppercase tracking-[2px] text-ink-muted">
        {title}
      </div>

      {/* 2. Cycling status message with blinking cursor */}
      <div className="font-mono text-accent-cyan text-base mt-4">
        {messages[stepIndex]}
        <span className="animate-blink">_</span>
      </div>

      {/* 3. Progress bar — caller eases to ~80%, snaps to 100% when ready */}
      <div className="w-72 h-[3px] rounded-full overflow-hidden mt-5 bg-border">
        <div
          className="h-full bg-accent-cyan transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 4. Optional context line */}
      {contextLine && (
        <div className="font-mono text-xs text-ink-muted mt-4">{contextLine}</div>
      )}
    </div>
  );
}
