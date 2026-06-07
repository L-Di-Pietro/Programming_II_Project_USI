import { useIsMobile } from "@/hooks/useIsMobile";

// Monitor glyph — inline SVG to match the app's icon convention (no icon library).
function IconMonitor() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const FEATURES = [
  "Run backtests across equities, crypto, and FX",
  "Inspect equity curves, drawdowns, and monthly return heatmaps",
  "Analyse strategy KPIs: Sharpe, Sortino, Calmar, Max Drawdown, and more",
];

/**
 * Below the desktop breakpoint the guided tour is suppressed; in its place this
 * non-dismissible banner explains that the app is built for larger screens.
 * Renders nothing on desktop, so the desktop DOM and layout are untouched.
 */
export function MobileDesktopBanner() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  return (
    <div className="px-4 pt-4">
      <section role="note" className="bg-surface border border-border rounded-lg p-5">
        <div className="flex items-center gap-2.5 text-accent-cyan">
          <IconMonitor />
          <h2 className="text-base font-semibold text-ink-primary">
            QuantEdge is built for desktop
          </h2>
        </div>

        <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-cyan" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs font-mono text-ink-muted">
          Open this page on a laptop or desktop for the full experience.
        </p>
      </section>
    </div>
  );
}
