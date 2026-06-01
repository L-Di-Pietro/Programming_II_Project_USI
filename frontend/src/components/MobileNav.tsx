import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { SideNav } from "./SideNav";

const SAFE_TOP = { paddingTop: "env(safe-area-inset-top)" } as const;

/**
 * Mobile/tablet navigation (below `lg`): a fixed top bar with the logo + a
 * hamburger that opens a left slide-in drawer reusing {@link SideNav}. Hidden at
 * `lg`+ where the desktop sidebar takes over.
 */
export function MobileNav({ latestRunId }: { latestRunId: number | null }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // While open: lock body scroll + close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Auto-close if the viewport grows to the desktop sidebar breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      {/* ── Fixed top bar ─────────────────────────────────────────── */}
      <header
        className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 border-b border-border bg-base"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 shrink-0 bg-accent-cyan"
            style={{ clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" }}
          />
          <span className="font-mono text-[11px] font-bold tracking-widest text-ink-primary">
            QUANTEDGE
          </span>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="-mr-2 flex h-11 w-11 items-center justify-center text-ink-primary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* ── Backdrop ──────────────────────────────────────────────── */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ── Drawer ────────────────────────────────────────────────── */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] max-w-[80vw] flex flex-col border-r border-border bg-base transition-transform duration-[250ms] ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={SAFE_TOP}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
      >
        <SideNav
          latestRunId={latestRunId}
          onNavigate={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      </aside>
    </>
  );
}
