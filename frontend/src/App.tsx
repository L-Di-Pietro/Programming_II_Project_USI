import { Link, Route, Routes } from "react-router-dom";

import { Dashboard } from "./pages/Dashboard";
import { NewBacktest } from "./pages/NewBacktest";
import { RunResults } from "./pages/RunResults";
import { Strategies } from "./pages/Strategies";

/**
 * Top-level layout shell. The nav is intentionally simple — four pages,
 * one click each. Page bodies live in src/pages/.
 */
export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold text-ink-900">
            QuantBacktest
          </Link>
          <nav className="flex gap-2 text-sm">
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/strategies">Strategies</NavLink>
            <NavLink to="/backtests/new">New backtest</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/backtests/new" element={<NewBacktest />} />
          <Route path="/backtests/:runId" element={<RunResults />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-slate-500 py-4 border-t border-slate-200 bg-white">
        QuantBacktest — USI Programming II Project 2.8
      </footer>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="btn-ghost">
      {children}
    </Link>
  );
}
