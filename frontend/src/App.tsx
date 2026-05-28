import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { Api } from "./api/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Dashboard } from "./pages/Dashboard";
import { NewBacktest } from "./pages/NewBacktest";
import { RunResults } from "./pages/RunResults";
import { Strategies } from "./pages/Strategies";

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

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation();
  const [latestRunId, setLatestRunId] = useState<number | null>(null);

  // Re-fetch latest run ID after each navigation so a just-completed backtest
  // appears immediately when the user lands on /backtests/:id.
  useEffect(() => {
    Api.listBacktests().then((runs) => {
      if (runs.length > 0) setLatestRunId(runs[0].id);
    }).catch(() => {});
  }, [location.pathname]);

  const pageTitle = (() => {
    if (location.pathname === "/")                   return "Dashboard";
    if (location.pathname === "/strategies")         return "Strategies";
    if (location.pathname === "/backtests/new")      return "Configure";
    if (location.pathname.startsWith("/backtests/")) return "Results";
    return "QuantBacktest";
  })();

  const onResultsPage =
    location.pathname.startsWith("/backtests/") &&
    !location.pathname.startsWith("/backtests/new");

  const staticNav = [
    { to: "/",              label: "Dashboard",  Icon: IconDashboard  },
    { to: "/strategies",    label: "Strategies", Icon: IconStrategies },
    { to: "/backtests/new", label: "Configure",  Icon: IconConfigure  },
  ];

  return (
    <div className="flex min-h-screen bg-base text-ink-primary">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-[180px] shrink-0 flex flex-col border-r border-border bg-base">

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <span
            className="w-2.5 h-2.5 shrink-0 bg-accent-cyan"
            style={{ clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" }}
          />
          <span className="font-mono text-[11px] font-bold tracking-widest text-ink-primary">
            QUANTEDGE
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col mt-1 flex-1">
          {staticNav.map(({ to, label, Icon }) => {
            const active =
              to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex items-center gap-2.5 px-5 py-2.5 text-[13px] transition-colors ${
                  active
                    ? "text-accent-cyan bg-accent-cyan/[0.07] font-medium"
                    : "text-ink-muted hover:text-ink-primary hover:bg-white/[0.03]"
                }`}
              >
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
              className={`relative flex items-center gap-2.5 px-5 py-2.5 text-[13px] transition-colors ${
                onResultsPage
                  ? "text-accent-cyan bg-accent-cyan/[0.07] font-medium"
                  : "text-ink-muted hover:text-ink-primary hover:bg-white/[0.03]"
              }`}
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

        <div className="px-5 py-4 text-[10px] font-mono text-ink-muted border-t border-border">
          USI PROG II &mdash; 2.8
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between px-8 py-3.5 border-b border-border bg-base shrink-0">
          <span className="text-sm font-semibold text-ink-primary tracking-wide">
            {pageTitle}
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
            Live
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/"                  element={<Dashboard />} />
              <Route path="/strategies"        element={<Strategies />} />
              <Route path="/backtests/new"     element={<NewBacktest />} />
              <Route path="/backtests/:runId"  element={<RunResults />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
