import { Link, useLocation } from "react-router-dom";

import { useIsMobile } from "@/hooks/useIsMobile";

// ── Inline SVG icon primitives ─────────────────────────────────────────────
function IconDashboard() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function IconStrategies() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function IconConfigure() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IconResults() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

const staticNav = [
  { to: "/",              label: "Dashboard",  Icon: IconDashboard  },
  { to: "/strategies",    label: "Strategies", Icon: IconStrategies },
  { to: "/backtests/new", label: "Configure",  Icon: IconConfigure  },
];

// Link styling. Mobile/drawer base is taller + slightly larger for touch; the
// `lg:` overrides restore the desktop sidebar's exact metrics (py-2.5/13px).
// Each SideNav instance is only visible at its own breakpoint (desktop <aside>
// vs. mobile drawer), so these responsive overrides never collide.
const linkClass = (active: boolean) =>
  `relative flex items-center gap-2.5 px-5 py-3 lg:py-2.5 text-[14px] lg:text-[13px] transition-colors ${
    active
      ? "text-accent-cyan bg-accent-cyan/[0.07] font-medium"
      : "text-ink-muted hover:text-ink-primary hover:bg-white/[0.03]"
  }`;

interface SideNavProps {
  latestRunId: number | null;
  /** Called after a nav link / action is tapped (used to close the mobile drawer). */
  onNavigate?: () => void;
  /** When provided, renders a close (✕) button in the header (mobile drawer only). */
  onClose?: () => void;
}

/**
 * Shared sidebar content (logo + nav + footer) rendered both inside the desktop
 * `<aside>` and the mobile slide-in drawer, so the two stay in sync.
 */
export function SideNav({ latestRunId, onNavigate, onClose }: SideNavProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const onResultsPage =
    location.pathname.startsWith("/backtests/") &&
    !location.pathname.startsWith("/backtests/new");

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <span
          className="w-2.5 h-2.5 shrink-0 bg-accent-cyan"
          style={{ clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" }}
        />
        <span className="font-mono text-[11px] font-bold tracking-widest text-ink-primary">
          QUANTEDGE
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto -mr-2 flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink-primary transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col mt-1 flex-1">
        {staticNav.map(({ to, label, Icon }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link key={to} to={to} onClick={() => onNavigate?.()} className={linkClass(active)}>
              {active && (
                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent-cyan rounded-r" />
              )}
              <Icon />
              {label}
            </Link>
          );
        })}

        {/* Results — only visible once a backtest has been run */}
        {latestRunId !== null && (
          <Link
            to={`/backtests/${latestRunId}`}
            onClick={() => onNavigate?.()}
            className={linkClass(onResultsPage)}
          >
            {onResultsPage && (
              <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent-cyan rounded-r" />
            )}
            <IconResults />
            Results
            {/* notification dot */}
            <span
              className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${
                onResultsPage ? "bg-accent-cyan" : "bg-accent-cyan/40"
              }`}
            />
          </Link>
        )}
      </nav>

      <div className="px-5 py-4 text-[10px] font-mono text-ink-muted border-t border-border space-y-2">
        {/* The guided tour is desktop-only, so its trigger is hidden on mobile. */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("onboarding:replay"));
              onNavigate?.();
            }}
            className="block text-left text-ink-muted hover:text-accent-cyan transition-colors"
          >
            Replay tutorial
          </button>
        )}
        <div>USI PROG II &mdash; 2.8</div>
      </div>
    </>
  );
}
