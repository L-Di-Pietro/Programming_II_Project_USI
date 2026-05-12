import { Link, Route, Routes, useLocation } from "react-router-dom";

import { Dashboard } from "./pages/Dashboard";
import { NewBacktest } from "./pages/NewBacktest";
import { RunResults } from "./pages/RunResults";
import { Strategies } from "./pages/Strategies";

const NAV_ITEMS = [
  { to: "/",               label: "Dashboard"  },
  { to: "/strategies",     label: "Strategies" },
  { to: "/backtests/new",  label: "Configure"  },
] as const;

export default function App() {
  const location = useLocation();

  const pageTitle = (() => {
    if (location.pathname === "/")                       return "Dashboard";
    if (location.pathname === "/strategies")             return "Strategies";
    if (location.pathname === "/backtests/new")          return "Configure";
    if (location.pathname.startsWith("/backtests/"))     return "Results";
    return "QuantBacktest";
  })();

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

        {/* Nav items */}
        <nav className="flex flex-col mt-1 flex-1">
          {NAV_ITEMS.map(({ to, label }) => {
            const active =
              to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex items-center px-5 py-2.5 text-[13px] transition-colors ${
                  active
                    ? "text-accent-cyan bg-accent-cyan/[0.07] font-medium"
                    : "text-ink-muted hover:text-ink-primary hover:bg-white/[0.03]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent-cyan rounded-r" />
                )}
                {label}
              </Link>
            );
          })}
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
          <Routes>
            <Route path="/"                  element={<Dashboard />} />
            <Route path="/strategies"        element={<Strategies />} />
            <Route path="/backtests/new"     element={<NewBacktest />} />
            <Route path="/backtests/:runId"  element={<RunResults />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
