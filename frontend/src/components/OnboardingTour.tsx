import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

import { Api } from "@/api/client";

/**
 * First-time, hands-on guided product tour. Self-contained and purely additive:
 * mounted once at the app root, it spotlights one UI element per step. For
 * `active` steps it asks the user to actually click the highlighted control,
 * lets the app navigate normally, then follows them to the next page and
 * resumes — teaching by doing. `passive` steps are informational (Next/Back).
 *
 * The overlay is fully click-through (only the tooltip card + resume chip catch
 * pointer events), so the page stays interactive. Shows automatically on the
 * first Dashboard visit, resumes across reloads via localStorage, and replays
 * via the `onboarding:replay` window event. No third-party tour library.
 */

const STORAGE_KEY = "onboarding_completed";
const STEP_KEY = "onboarding_step";
const REPLAY_EVENT = "onboarding:replay";

const SPOT_PAD = 8;
const NUDGE_MS = 8000; // idle time on an active step before a gentle nudge
const POLL_MS = 120; // target-resolution poll interval
const POLL_TIMEOUT_MS = 12000; // give up waiting for a target after this

// ── Route predicates (the Results route is dynamic) ──────────────────────────
const isHome = (p: string) => p === "/";
const isStrategies = (p: string) => p === "/strategies";
const isConfigure = (p: string) => p === "/backtests/new";
const isResults = (p: string) => p.startsWith("/backtests/") && p !== "/backtests/new";

type StepKind = "passive" | "active";

type TourStep = {
  id: string;
  kind: StepKind;
  title: string;
  body: string;
  /** Active steps: the imperative shown in place of the Next button. */
  actionLabel?: string;
  /** CSS selector for the spotlight + (active) the click hit-test. */
  targetSel?: string;
  /** Which route this step lives on (for resume + Back). */
  matchRoute: (p: string) => boolean;
  /** Active + navigates: the route the click is expected to land on. */
  navigatesTo?: (p: string) => boolean;
  /** Close the AI modal before leaving this step (so the next target is reachable). */
  closesModalOnLeave?: boolean;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    kind: "passive",
    title: "Welcome",
    body: "This quick tour walks you through the app hands-on — you'll actually navigate it as we go. Ready?",
    matchRoute: isHome,
  },
  {
    id: "nav-strategies",
    kind: "active",
    title: "Browse strategies",
    body: "Let's start by picking a strategy to test.",
    actionLabel: "👆 Click Strategies in the sidebar",
    targetSel: 'aside a[href="/strategies"]',
    matchRoute: isHome,
    navigatesTo: isStrategies,
  },
  {
    id: "pick-strategy",
    kind: "active",
    title: "Choose a strategy",
    body: "Each card describes a trading strategy and its logic.",
    actionLabel: "👆 Click any strategy to configure it",
    targetSel: '[data-tour="strategy-card"]',
    matchRoute: isStrategies,
    navigatesTo: isConfigure,
  },
  {
    id: "choose-asset",
    kind: "active",
    title: "Choose an asset",
    body: "Pick what to backtest — stocks, crypto or FX.",
    actionLabel: "👆 Click an instrument to select it",
    targetSel: '[data-tour="instrument-grid"]',
    matchRoute: isConfigure,
  },
  {
    id: "period",
    kind: "passive",
    title: "Backtest period",
    body: "Set your start and end dates. They auto-clamp to the data available for the asset, so you can never pick an invalid range.",
    targetSel: '[data-tour="period"]',
    matchRoute: isConfigure,
  },
  {
    id: "run",
    kind: "active",
    title: "Run it",
    body: "Everything's set — time to launch the backtest.",
    actionLabel: "👆 Click Run Backtest",
    targetSel: '[data-tour="run-backtest"]',
    matchRoute: isConfigure,
    navigatesTo: isResults,
  },
  {
    id: "metrics",
    kind: "passive",
    title: "Your metrics",
    body: "Here are your full performance metrics — returns, risk ratios and trade statistics, all in one place.",
    targetSel: '[data-tour="metrics"]',
    matchRoute: isResults,
  },
  {
    id: "ai-analysis",
    kind: "active",
    title: "AI analysis",
    body: "Want your results in plain English?",
    actionLabel: "👆 Click AI Analysis",
    targetSel: '[data-tour="ai-analysis"]',
    matchRoute: isResults,
  },
  {
    id: "ai-panel",
    kind: "passive",
    title: "AI analyst",
    body: "The AI analyst summarizes your strategy's strengths, weaknesses and suggested next steps — personalized to this exact backtest.",
    targetSel: '[data-tour="ai-panel"]',
    matchRoute: isResults,
    closesModalOnLeave: true,
  },
  {
    id: "nav-dashboard",
    kind: "active",
    title: "Your dashboard",
    body: "Last stop: your backtest history and reports.",
    actionLabel: "👆 Click Dashboard in the sidebar",
    targetSel: 'aside a[href="/"]',
    matchRoute: isResults,
    navigatesTo: isHome,
  },
  {
    id: "finish",
    kind: "passive",
    title: "You're all set!",
    body: "You've just run your first backtest. Come back to the Dashboard anytime to review past runs and generate AI reports.",
    matchRoute: isHome,
  },
];

const resolveTarget = (s: TourStep): Element | null =>
  s.targetSel ? document.querySelector(s.targetSel) : null;

export function OnboardingTour() {
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const [resolving, setResolving] = useState(false); // waiting for the target to mount
  const [awaitingNav, setAwaitingNav] = useState(false); // clicked, waiting for navigation
  const [offTrack, setOffTrack] = useState(false);
  const [nudge, setNudge] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  // When set, the next location change to a matching route is the expected
  // result of an active-step click (advance) rather than the user wandering off.
  const expectingNavRef = useRef<((p: string) => boolean) | null>(null);
  // Last Results path we saw — lets Back / resume return to the right run.
  const lastResultsPathRef = useRef<string | null>(null);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  // Auto-launch on first Dashboard visit, or resume a persisted step on reload.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const saved = localStorage.getItem(STEP_KEY);
    if (saved !== null) {
      const idx = Math.min(STEPS.length - 1, Math.max(0, Number(saved) || 0));
      setStepIndex(idx);
      setOpen(true);
      return;
    }
    if (location.pathname === "/") {
      setStepIndex(0);
      setOpen(true);
    }
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the current step so a full reload resumes where we left off.
  useEffect(() => {
    if (!open) return;
    localStorage.setItem(STEP_KEY, String(stepIndex));
  }, [open, stepIndex]);

  // Remember the most recent Results path for Back / resume navigation.
  useEffect(() => {
    if (isResults(location.pathname)) lastResultsPathRef.current = location.pathname;
  }, [location.pathname]);

  // Replay bridge (footer link dispatches this) — always listening.
  useEffect(() => {
    const onReplay = () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STEP_KEY);
      expectingNavRef.current = null;
      setOffTrack(false);
      setAwaitingNav(false);
      setClosing(false);
      setStepIndex(0);
      setOpen(true);
      navigate("/");
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [navigate]);

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    expectingNavRef.current = null;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setOffTrack(false);
    }, 300);
  }, []);

  // Navigate to the concrete route a step lives on (used by Back + resume).
  const gotoStepRoute = useCallback(
    async (s: TourStep) => {
      let path: string | null = null;
      if (s.matchRoute("/")) path = "/";
      else if (s.matchRoute("/strategies")) path = "/strategies";
      else if (s.matchRoute("/backtests/new")) path = "/backtests/new";
      else {
        path = lastResultsPathRef.current;
        if (!path) {
          try {
            const runs = await Api.listBacktests();
            if (runs.length) path = `/backtests/${runs[0].id}`;
          } catch {
            /* leave null — nothing to navigate to */
          }
        }
      }
      if (path) navigate(path);
    },
    [navigate],
  );

  const advance = useCallback(() => {
    setNudge(false);
    setAwaitingNav(false);
    if (stepIndex >= STEPS.length - 1) {
      close();
      return;
    }
    if (STEPS[stepIndex].closesModalOnLeave) {
      const closeBtn = document.querySelector(
        '[data-tour="ai-panel"] button[aria-label="Close"]',
      ) as HTMLElement | null;
      closeBtn?.click();
    }
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }, [stepIndex, close]);

  const back = useCallback(() => {
    setNudge(false);
    setAwaitingNav(false);
    expectingNavRef.current = null;
    if (stepIndex === 0) return;
    const prev = STEPS[stepIndex - 1];
    setOffTrack(false);
    setStepIndex(stepIndex - 1);
    if (!prev.matchRoute(location.pathname)) void gotoStepRoute(prev);
  }, [stepIndex, location.pathname, gotoStepRoute]);

  const resume = useCallback(() => {
    setOffTrack(false);
    setAwaitingNav(false);
    void gotoStepRoute(STEPS[stepIndex]);
  }, [stepIndex, gotoStepRoute]);

  // Resolve + track the target rect for the current step. Polls until the
  // element mounts (it may appear only after a loader/navigation/modal), so the
  // tour rides smoothly through the in-app loading screens.
  useLayoutEffect(() => {
    if (!open || offTrack) return;
    setRect(null);
    if (!step.targetSel) {
      setResolving(false);
      return;
    }

    let cancelled = false;
    let pollId = 0;
    const start = performance.now();

    const measure = () => {
      const el = resolveTarget(step);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    const poll = () => {
      if (cancelled) return;
      const el = resolveTarget(step);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
        setRect(el.getBoundingClientRect());
        setResolving(false);
        return;
      }
      if (performance.now() - start > POLL_TIMEOUT_MS) {
        setResolving(false);
        return;
      }
      pollId = window.setTimeout(poll, POLL_MS);
    };

    setResolving(true);
    poll();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      if (pollId) clearTimeout(pollId);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, stepIndex, step, offTrack, location.pathname]);

  // Position the tooltip card relative to the target (or center it).
  useLayoutEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!rect || !card) {
      setTipPos(null); // centered
      return;
    }
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 14;
    const m = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampX = (x: number) => Math.max(m, Math.min(x, vw - cw - m));
    const clampY = (y: number) => Math.max(m, Math.min(y, vh - ch - m));
    const cx = rect.left + rect.width / 2 - cw / 2;
    const cy = rect.top + rect.height / 2 - ch / 2;

    let pos: { top: number; left: number };
    if (rect.left < vw * 0.22 && vw - rect.right >= cw + gap) {
      pos = { top: clampY(cy), left: rect.right + gap }; // left-edge target → point right
    } else if (vh - rect.bottom >= ch + gap) {
      pos = { top: rect.bottom + gap, left: clampX(cx) }; // below
    } else if (rect.top >= ch + gap) {
      pos = { top: rect.top - ch - gap, left: clampX(cx) }; // above
    } else if (vw - rect.right >= cw + gap) {
      pos = { top: clampY(cy), left: rect.right + gap }; // right
    } else if (rect.left >= cw + gap) {
      pos = { top: clampY(cy), left: rect.left - cw - gap }; // left
    } else {
      pos = { top: clampY(rect.bottom + gap), left: clampX(cx) }; // fallback
    }
    setTipPos(pos);
  }, [open, rect, stepIndex]);

  // Observe real clicks on the spotlighted element (active steps). We don't
  // preventDefault, so the link/button does its normal job; we just record that
  // the action happened and (for non-navigating steps) advance.
  useEffect(() => {
    if (!open || offTrack || step.kind !== "active" || !step.targetSel) return;
    const sel = step.targetSel;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !target.closest(sel)) return;
      if (step.navigatesTo) {
        expectingNavRef.current = step.navigatesTo;
        setAwaitingNav(true); // show a transient "loading" state until the route lands
      } else {
        advance(); // opens a modal / selects in place — no route change
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [open, offTrack, step, advance]);

  // React to navigation: consume an expected click-driven nav (advance), else
  // flag off-track when we're no longer on the step's route.
  useEffect(() => {
    if (!open) return;
    const path = location.pathname;
    if (expectingNavRef.current) {
      const pred = expectingNavRef.current;
      if (pred(path)) {
        expectingNavRef.current = null;
        setAwaitingNav(false);
        setOffTrack(false);
        setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
        return;
      }
      expectingNavRef.current = null;
      setAwaitingNav(false);
    }
    setOffTrack(!STEPS[stepIndex].matchRoute(path));
  }, [location.pathname, open, stepIndex]);

  // Gentle nudge if the user idles on an active step (never auto-advances).
  useEffect(() => {
    if (!open || offTrack || step.kind !== "active") return;
    setNudge(false);
    const t = window.setInterval(() => {
      setNudge(true);
      window.setTimeout(() => setNudge(false), 700);
    }, NUDGE_MS);
    return () => clearInterval(t);
  }, [open, stepIndex, step, offTrack]);

  // Keyboard: Escape always skips; passive steps advance on Enter/→; ← goes
  // Back. Active steps cannot be advanced by keyboard — the click is required.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && step.kind === "passive") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, close, back, advance]);

  if (!open) return null;

  const spot =
    rect !== null
      ? {
          top: rect.top - SPOT_PAD,
          left: rect.left - SPOT_PAD,
          width: rect.width + SPOT_PAD * 2,
          height: rect.height + SPOT_PAD * 2,
        }
      : null;

  const waiting = (resolving || awaitingNav) && !!step.targetSel;
  const showAction = step.kind === "active" && !waiting && step.actionLabel;

  return createPortal(
    <div className={`ot-root ${closing ? "ot-closing" : ""}`} role="dialog" aria-modal="true">
      <style>{CSS}</style>

      {offTrack ? (
        <>
          <div className="ot-dim" />
          <button type="button" className="ot-chip" onClick={resume}>
            You went off-track — click to resume ▶
          </button>
        </>
      ) : (
        <>
          {spot ? <div className="ot-spot" style={spot} /> : <div className="ot-dim" />}
          {spot && step.kind === "active" && <div className="ot-pulse" style={spot} />}

          <div
            ref={cardRef}
            className={`ot-card ${tipPos ? "" : "ot-centered"} ${nudge && tipPos ? "ot-card--nudge" : ""}`}
            style={tipPos ?? undefined}
          >
            <div className="ot-step">
              Step {stepIndex + 1} of {STEPS.length}
            </div>
            <div className="ot-title">{step.title}</div>
            <p className="ot-body">{waiting ? "Loading the next step…" : step.body}</p>

            {showAction && (
              <div className={`ot-action ${nudge ? "ot-action--nudge" : ""}`}>{step.actionLabel}</div>
            )}

            <div className="ot-footer">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={back}
                disabled={isFirst}
              >
                ← Back
              </button>
              <div className="ot-footer-right">
                <button type="button" className="ot-skip" onClick={close}>
                  Skip tutorial
                </button>
                {step.kind === "passive" && (
                  <button type="button" className="btn-primary text-xs" onClick={advance}>
                    {isLast ? "Finish" : "Next →"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

const CSS = `
.ot-root { position: fixed; inset: 0; z-index: 100; pointer-events: none; }
.ot-root.ot-closing { animation: ot-fade 300ms ease forwards; }
@keyframes ot-fade { to { opacity: 0; } }

.ot-dim { position: fixed; inset: 0; background: rgba(0,0,0,0.6); pointer-events: none; }
.ot-spot {
  position: fixed; border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.55),
              0 0 22px 2px rgba(34,211,238,0.25);
  transition: top .32s cubic-bezier(.4,0,.2,1), left .32s cubic-bezier(.4,0,.2,1),
              width .32s cubic-bezier(.4,0,.2,1), height .32s cubic-bezier(.4,0,.2,1);
}

/* Ripple pulse on the active target — a ring that grows out and fades,
   visually distinct from the static spotlight border. */
.ot-pulse {
  position: fixed; border-radius: 12px; pointer-events: none;
  border: 2px solid rgba(34,211,238,0.9);
  animation: ot-ripple 1.4s ease-out infinite;
  transition: top .32s cubic-bezier(.4,0,.2,1), left .32s cubic-bezier(.4,0,.2,1),
              width .32s cubic-bezier(.4,0,.2,1), height .32s cubic-bezier(.4,0,.2,1);
}
@keyframes ot-ripple {
  0%   { transform: scale(1);    opacity: 0.9; }
  100% { transform: scale(1.12); opacity: 0;   }
}

.ot-card {
  position: fixed; width: 340px; max-width: calc(100vw - 24px);
  pointer-events: auto;
  background: #161b22; border: 1px solid rgba(34,211,238,0.4); border-radius: 14px;
  padding: 18px 18px 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.55);
  font-family: Inter, system-ui, -apple-system, sans-serif;
  transition: top .26s ease, left .26s ease;
}
.ot-card.ot-centered { top: 50%; left: 50%; transform: translate(-50%, -50%); }
.ot-card--nudge { animation: ot-shake 0.5s ease; }
@keyframes ot-shake {
  0%,100% { transform: translateX(0); }
  20%,60% { transform: translateX(-5px); }
  40%,80% { transform: translateX(5px); }
}

.ot-step {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
  color: #22d3ee; margin-bottom: 8px;
}
.ot-title { font-size: 16px; font-weight: 700; color: #e6edf3; margin-bottom: 8px; }
.ot-body { font-size: 13px; line-height: 1.6; color: #7d8590; margin: 0 0 16px; }

.ot-action {
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 12px; font-weight: 600; color: #22d3ee;
}
.ot-action--nudge { animation: ot-flash 0.6s ease 2; }
@keyframes ot-flash { 50% { opacity: 0.35; } }

.ot-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ot-footer-right { display: flex; align-items: center; gap: 14px; }
.ot-skip {
  background: none; border: none; cursor: pointer; padding: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11px; color: #7d8590; transition: color .15s ease;
}
.ot-skip:hover { color: #e6edf3; }

.ot-chip {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  pointer-events: auto; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  background: #161b22; border: 1px solid rgba(34,211,238,0.5); border-radius: 999px;
  padding: 10px 18px; color: #e6edf3; font-size: 13px;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  box-shadow: 0 8px 28px rgba(0,0,0,0.5);
  animation: ot-chip-in 0.3s ease;
}
.ot-chip:hover { border-color: #22d3ee; }
@keyframes ot-chip-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to   { opacity: 1; transform: translateX(-50%); }
}

@media (max-width: 480px) {
  .ot-card { width: calc(100vw - 24px); }
}

@media (prefers-reduced-motion: reduce) {
  .ot-pulse, .ot-card--nudge, .ot-action--nudge, .ot-chip { animation: none !important; }
}
`;
