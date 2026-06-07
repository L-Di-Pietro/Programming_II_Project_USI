import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { Api } from "./api/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MobileDesktopBanner } from "./components/MobileDesktopBanner";
import { MobileNav } from "./components/MobileNav";
import { OnboardingTour } from "./components/OnboardingTour";
import { SideNav } from "./components/SideNav";
import { Dashboard } from "./pages/Dashboard";
import { NewBacktest } from "./pages/NewBacktest";
import { RunResults } from "./pages/RunResults";
import { Strategies } from "./pages/Strategies";

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
    return "QuantEdge";
  })();

  return (
    <div className="flex min-h-screen bg-base text-ink-primary">

      {/* ── Sidebar (desktop ≥1024px) ──────────────────────────────── */}
      <aside className="hidden lg:flex w-[180px] shrink-0 flex-col border-r border-border bg-base">
        <SideNav latestRunId={latestRunId} />
      </aside>

      {/* ── Mobile/tablet nav (<1024px): fixed top bar + drawer ────── */}
      <MobileNav latestRunId={latestRunId} />

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 mobile-nav-offset lg:pt-0">

        {/* Top bar (desktop only — mobile uses MobileNav's bar) */}
        <header className="hidden lg:flex items-center justify-between px-8 py-3.5 border-b border-border bg-base shrink-0">
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
          <MobileDesktopBanner />
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

      <OnboardingTour />
    </div>
  );
}
