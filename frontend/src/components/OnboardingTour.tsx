import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * First-time guided product tour. Self-contained and purely additive: mounted
 * once at the app root, it dims the page and spotlights one UI element per step
 * with an adjacent tooltip card. Shows automatically on the first Dashboard
 * visit (localStorage flag) and never again, unless replayed via the
 * `onboarding:replay` window event. No third-party tour library.
 */

const STORAGE_KEY = "onboarding_completed";
const REPLAY_EVENT = "onboarding:replay";

type Step = {
  title: string;
  body: string;
  /** Resolves the element to spotlight. Missing/`null` ⇒ centered card, no cutout. */
  target?: () => Element | null;
};

const STEPS: Step[] = [
  {
    title: "Welcome",
    body: "Welcome to the backtesting engine. This quick tour shows how to test a trading strategy in under two minutes — you can skip at any time.",
  },
  {
    title: "Strategies",
    body: "Browse the strategy library — SMA Crossover, Bollinger Bands and more. Each strategy comes with a plain-English description, so you can pick the one that fits your style.",
    target: () => document.querySelector('aside a[href="/strategies"]'),
  },
  {
    title: "Configure a run",
    body: "This is where you set up a backtest: choose the asset, the data interval, the time period and the strategy's parameters before launching it.",
    target: () => document.querySelector('aside a[href="/backtests/new"]'),
  },
  {
    title: "Backtest period",
    body: "You pick a start and end date for the test. The dates automatically clamp to the data actually available for the chosen asset, so you never test an empty range.",
  },
  {
    title: "Run a backtest",
    body: "When your setup is ready, launch the run from here. It finishes in about two seconds and takes you straight to the Results page.",
    target: () => document.querySelector('main a[href="/backtests/new"].btn-secondary'),
  },
  {
    title: "Results & metrics",
    body: "Results shows your strategy's full performance — key metrics, the equity curve, drawdown, monthly returns and a trade-by-trade breakdown.",
    target: () =>
      document.querySelector('aside a[href^="/backtests/"]:not([href="/backtests/new"])'),
  },
  {
    title: "AI Analysis",
    body: "On the Results page, AI Analysis opens an AI analyst that reads your results and explains them in plain language — strengths, risks and suggested next steps.",
  },
  {
    title: "Dashboard & history",
    body: "Your Dashboard keeps a history of every backtest you run, so you can revisit past results and download polished PDF reports anytime.",
    target: () => document.querySelector("main .overflow-x-auto"),
  },
];

const SPOT_PAD = 8;

export function OnboardingTour() {
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  // Auto-launch once, on the first Dashboard visit.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (location.pathname !== "/") return;
    setStepIndex(0);
    setOpen(true);
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay bridge (footer link dispatches this) — always listening.
  useEffect(() => {
    const onReplay = () => {
      localStorage.removeItem(STORAGE_KEY);
      navigate("/");
      setClosing(false);
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [navigate]);

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 300);
  }, []);

  const next = useCallback(() => {
    if (isLast) close();
    else setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }, [isLast, close]);

  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  // Resolve + track the target rect for the current step.
  useLayoutEffect(() => {
    if (!open) return;
    const el = step.target?.() ?? null;
    if (el) el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    const measure = () => {
      const e = step.target?.() ?? null;
      setRect(e ? e.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, stepIndex, step]);

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

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, close]);

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

  return createPortal(
    <div className={`ot-root ${closing ? "ot-closing" : ""}`} role="dialog" aria-modal="true">
      <style>{CSS}</style>

      {spot ? (
        <div className="ot-spot" style={spot} />
      ) : (
        <div className="ot-dim" />
      )}
      <div className="ot-block" />

      <div
        ref={cardRef}
        className={`ot-card ${tipPos ? "" : "ot-centered"}`}
        style={tipPos ?? undefined}
      >
        <div className="ot-step">
          Step {stepIndex + 1} of {STEPS.length}
        </div>
        <div className="ot-title">{step.title}</div>
        <p className="ot-body">{step.body}</p>
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
            <button type="button" className="btn-primary text-xs" onClick={next}>
              {isLast ? "Finish" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
.ot-root { position: fixed; inset: 0; z-index: 100; pointer-events: none; }
.ot-root.ot-closing { animation: ot-fade 300ms ease forwards; }
@keyframes ot-fade { to { opacity: 0; } }

.ot-dim { position: fixed; inset: 0; background: rgba(0,0,0,0.6); }
.ot-block { position: fixed; inset: 0; pointer-events: auto; }
.ot-spot {
  position: fixed; border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.55),
              0 0 22px 2px rgba(34,211,238,0.25);
  transition: top .32s cubic-bezier(.4,0,.2,1), left .32s cubic-bezier(.4,0,.2,1),
              width .32s cubic-bezier(.4,0,.2,1), height .32s cubic-bezier(.4,0,.2,1);
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

.ot-step {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
  color: #22d3ee; margin-bottom: 8px;
}
.ot-title { font-size: 16px; font-weight: 700; color: #e6edf3; margin-bottom: 8px; }
.ot-body { font-size: 13px; line-height: 1.6; color: #7d8590; margin: 0 0 16px; }

.ot-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ot-footer-right { display: flex; align-items: center; gap: 14px; }
.ot-skip {
  background: none; border: none; cursor: pointer; padding: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11px; color: #7d8590; transition: color .15s ease;
}
.ot-skip:hover { color: #e6edf3; }

@media (max-width: 480px) {
  .ot-card { width: calc(100vw - 24px); }
}
`;
