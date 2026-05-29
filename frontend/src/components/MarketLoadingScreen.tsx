import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Full-viewport, finance-themed loading screen. Self-contained: all keyframes
 * live in a scoped <style> block (mls- prefix), no global CSS / tailwind edits,
 * no animation-library dependency — just CSS + one <canvas>. Reusable on any
 * page: render it while loading and pass `fadeOut` to dissolve it out.
 */

const DEFAULT_MESSAGES = [
  "Initializing strategies…",
  "Loading market data…",
  "Fetching tickers…",
  "Calibrating engine…",
  "Almost ready…",
];

// Fake tape entries — symbol + % change (sign drives colour).
const TAPE: { sym: string; chg: number }[] = [
  { sym: "SPY", chg: 1.2 },
  { sym: "BTC", chg: -3.4 },
  { sym: "AAPL", chg: 0.8 },
  { sym: "EUR/USD", chg: 0.1 },
  { sym: "TSLA", chg: -2.1 },
  { sym: "NVDA", chg: 4.6 },
  { sym: "ETH", chg: 2.3 },
  { sym: "GLD", chg: -0.5 },
  { sym: "MSFT", chg: 1.1 },
  { sym: "QQQ", chg: 0.9 },
  { sym: "USD/JPY", chg: -0.3 },
  { sym: "AMZN", chg: 1.7 },
  { sym: "META", chg: -1.4 },
  { sym: "XAU", chg: 0.6 },
];

const GREEN = "#3fb950";
const RED = "#f85149";
const CYAN = "#22d3ee";
const MUTED = "#7d8590";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Floater {
  id: number;
  text: string;
  color: string;
  left: number;
  size: number;
  dur: number;
  delay: number;
  op: number;
  dir: "up" | "down";
  blur: number;
}

function makeFloaters(n: number): Floater[] {
  return Array.from({ length: n }, (_, id) => {
    const r = Math.random();
    let text: string;
    let color: string;
    if (r < 0.4) {
      text = `$${(Math.random() * 900 + 10).toFixed(2)}`;
      color = MUTED;
    } else if (r < 0.7) {
      const v = Math.random() * 8 - 4;
      text = `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
      color = v >= 0 ? GREEN : RED;
    } else if (r < 0.85) {
      const v = Math.round(Math.random() * 80 - 40);
      text = `${v >= 0 ? "+" : ""}${v} bps`;
      color = v >= 0 ? GREEN : RED;
    } else {
      text = (Math.random() * 1.5 + 0.5).toFixed(4);
      color = MUTED;
    }
    return {
      id,
      text,
      color,
      left: Math.random() * 100,
      size: 11 + Math.random() * 15,
      dur: 9 + Math.random() * 13,
      delay: -Math.random() * 22, // negative → field is already populated at mount
      op: 0.1 + Math.random() * 0.34,
      dir: Math.random() < 0.5 ? "up" : "down",
      blur: Math.random() < 0.5 ? 1.2 : 0,
    };
  });
}

export function MarketLoadingScreen({
  fadeOut = false,
  messages = DEFAULT_MESSAGES,
  offsetLeft = 0,
}: {
  fadeOut?: boolean;
  messages?: string[];
  /** Left inset in px — e.g. a sidebar width — so the screen covers only the
   *  content area to its right. Defaults to 0 (full viewport). */
  offsetLeft?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const floaters = useMemo(() => makeFloaters(18), []);
  const reduced = useMemo(prefersReducedMotion, []);

  // Cycle the status label.
  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), 1600);
    return () => clearInterval(t);
  }, [messages.length]);

  // Subtle pointer parallax via CSS vars (no React re-render).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;
    let raf = 0;
    let nx = 0;
    let ny = 0;
    const apply = () => {
      raf = 0;
      root.style.setProperty("--mls-px", nx.toFixed(3));
      root.style.setProperty("--mls-py", ny.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      nx = e.clientX / window.innerWidth - 0.5;
      ny = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Live candlestick ghost on a single canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const CW = 16; // candle slot width (px)
    const RANGE = 18; // price units mapped to the vertical band
    let W = 0;
    let H = 0;
    let candles: { x: number; open: number; close: number; high: number; low: number }[] = [];

    const gen = (x: number, prev: number) => {
      const open = prev;
      const close = open * 0.94 + (Math.random() - 0.5) * 3.4; // mean-reverting random walk
      const high = Math.max(open, close) + Math.random() * 1.3;
      const low = Math.min(open, close) - Math.random() * 1.3;
      return { x, open, close, high, low };
    };

    const seed = () => {
      candles = [];
      const n = Math.ceil(W / CW) + 4;
      let p = 0;
      for (let i = 0; i < n; i++) {
        const c = gen(i * CW, p);
        p = c.close;
        candles.push(c);
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const yOf = (p: number) => H * 0.5 - (p / RANGE) * (H * 0.34);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const c of candles) {
        const up = c.close >= c.open;
        const color = up ? GREEN : RED;
        const xc = c.x + CW / 2;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.32;
        ctx.beginPath();
        ctx.moveTo(xc, yOf(c.high));
        ctx.lineTo(xc, yOf(c.low));
        ctx.stroke();
        const yO = yOf(c.open);
        const yC = yOf(c.close);
        const top = Math.min(yO, yC);
        const h = Math.max(2, Math.abs(yC - yO));
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = color;
        ctx.fillRect(c.x + 2.5, top, CW - 5, h);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduced) {
      draw();
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const dx = (dt / 1000) * 42; // ~42 px/sec leftward scroll
      for (const c of candles) c.x -= dx;
      while (candles.length && candles[0].x < -CW) {
        candles.shift();
        const prev = candles[candles.length - 1];
        candles.push(gen(prev.x + CW, prev.close));
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  const tape = [...TAPE, ...TAPE]; // doubled for a seamless marquee loop

  return (
    <div
      ref={rootRef}
      className={`mls-root fixed top-0 right-0 bottom-0 z-50 overflow-hidden bg-base transition-opacity duration-500 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ left: offsetLeft }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <style>{CSS}</style>

      {/* Vignette / depth wash */}
      <div className="mls-vignette" />

      {/* Background plane — floating numbers */}
      <div className="mls-plane mls-bg">
        {floaters.map((f) => (
          <span
            key={f.id}
            className="mls-floater"
            style={{
              left: `${f.left}%`,
              fontSize: `${f.size}px`,
              color: f.color,
              filter: f.blur ? `blur(${f.blur}px)` : undefined,
              // @ts-expect-error custom prop
              "--op": f.op,
              animationName: f.dir === "up" ? "mls-up" : "mls-down",
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            {f.text}
          </span>
        ))}
      </div>

      {/* Midground plane — live candlestick ghost */}
      <div className="mls-plane mls-mid">
        <canvas ref={canvasRef} className="mls-canvas" />
      </div>

      {/* Foreground plane */}
      <div className="mls-plane mls-fg">
        {/* Ticker tape */}
        <div className="mls-tape">
          <div className="mls-tape-track">
            {tape.map((t, i) => {
              const up = t.chg >= 0;
              return (
                <span key={i} className="mls-tape-item">
                  <span className="mls-tape-sym">{t.sym}</span>
                  <span style={{ color: up ? GREEN : RED }}>
                    {up ? "▲" : "▼"} {up ? "+" : ""}
                    {t.chg.toFixed(1)}%
                  </span>
                  <span className="mls-tape-dot">·</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Central breathing candlestick */}
        <div className="mls-center">
          <div className="mls-halo" />
          <div className="mls-ring" />
          <svg
            className="mls-candle"
            width="128"
            height="216"
            viewBox="0 0 128 216"
            fill="none"
          >
            <defs>
              <linearGradient id="mls-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={CYAN} stopOpacity="0.6" />
                <stop offset="1" stopColor={GREEN} stopOpacity="0.32" />
              </linearGradient>
            </defs>
            <line x1="64" y1="12" x2="64" y2="204" stroke={CYAN} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
            <rect x="38" y="62" width="52" height="96" rx="7" fill="url(#mls-body)" stroke={CYAN} strokeWidth="2" />
          </svg>
        </div>

        {/* Loading indicator */}
        <div className="mls-loader">
          <div className="mls-bar">
            <div className="mls-bar-fill" />
          </div>
          <div className="mls-msg">
            {messages[msgIdx]}
            <span className="mls-cursor">_</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Scoped styles — all class names prefixed `mls-` to avoid collisions.
const CSS = `
.mls-root { --mls-px: 0; --mls-py: 0; color: #e6edf3; }
.mls-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 12%, rgba(34,211,238,0.06), transparent 60%),
    radial-gradient(120% 120% at 50% 120%, rgba(192,132,252,0.05), transparent 55%),
    radial-gradient(100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55));
}
.mls-plane { position: absolute; inset: 0; }
.mls-bg  { transform: translate(calc(var(--mls-px) * -22px), calc(var(--mls-py) * -22px)); opacity: 0.9; }
.mls-mid { transform: translate(calc(var(--mls-px) * -12px), calc(var(--mls-py) * -12px)); }
.mls-fg  { transform: translate(calc(var(--mls-px) *   7px), calc(var(--mls-py) *   7px)); }

.mls-canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.5; }

.mls-floater {
  position: absolute; top: 0;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-weight: 500; white-space: nowrap; opacity: 0;
  animation-timing-function: linear; animation-iteration-count: infinite;
  will-change: transform, opacity;
}
@keyframes mls-up {
  0%   { transform: translateY(102vh); opacity: 0; }
  8%   { opacity: var(--op); }
  92%  { opacity: var(--op); }
  100% { transform: translateY(-18vh); opacity: 0; }
}
@keyframes mls-down {
  0%   { transform: translateY(-18vh); opacity: 0; }
  8%   { opacity: var(--op); }
  92%  { opacity: var(--op); }
  100% { transform: translateY(102vh); opacity: 0; }
}

.mls-tape {
  position: absolute; top: 7%; left: 0; right: 0;
  display: flex; overflow: hidden;
  border-top: 1px solid rgba(125,133,144,0.14);
  border-bottom: 1px solid rgba(125,133,144,0.14);
  padding: 8px 0; background: rgba(13,17,23,0.35); backdrop-filter: blur(1px);
}
.mls-tape-track {
  display: flex; flex-shrink: 0; white-space: nowrap;
  animation: mls-marquee 32s linear infinite; will-change: transform;
}
.mls-tape-item {
  display: inline-flex; align-items: center; gap: 8px; padding: 0 18px;
  font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px;
}
.mls-tape-sym { color: #e6edf3; font-weight: 600; }
.mls-tape-dot { color: rgba(125,133,144,0.5); }
@keyframes mls-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.mls-center {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 320px; height: 320px; display: grid; place-items: center;
}
.mls-halo {
  position: absolute; width: 260px; height: 260px; border-radius: 50%;
  background: radial-gradient(circle, rgba(34,211,238,0.22), transparent 65%);
  animation: mls-glow 4.5s ease-in-out infinite; will-change: transform, opacity;
}
.mls-ring {
  position: absolute; width: 240px; height: 240px; border-radius: 50%;
  border: 1px dashed rgba(34,211,238,0.28);
  animation: mls-spin 22s linear infinite; will-change: transform;
}
.mls-candle {
  position: relative;
  filter: drop-shadow(0 0 18px rgba(34,211,238,0.55));
  animation: mls-breathe 4s ease-in-out infinite; will-change: transform;
}
@keyframes mls-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes mls-glow { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.14); } }
@keyframes mls-spin { to { transform: rotate(360deg); } }

.mls-loader {
  position: absolute; left: 50%; bottom: 16%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 14px; width: 300px;
}
.mls-bar {
  position: relative; width: 100%; height: 3px; border-radius: 999px;
  background: rgba(125,133,144,0.18); overflow: hidden;
}
.mls-bar-fill {
  position: absolute; top: 0; left: 0; height: 100%; width: 40%; border-radius: 999px;
  background: linear-gradient(90deg, transparent, ${CYAN}, transparent);
  animation: mls-shimmer 1.6s ease-in-out infinite; will-change: transform;
}
@keyframes mls-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }
.mls-msg {
  font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px;
  letter-spacing: 0.3px; color: #7d8590;
}
.mls-cursor { animation: mls-blink 1s step-end infinite; color: ${CYAN}; }
@keyframes mls-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .mls-floater, .mls-tape-track, .mls-halo, .mls-ring, .mls-candle,
  .mls-bar-fill, .mls-cursor { animation: none !important; }
  .mls-floater { opacity: var(--op); }
  .mls-bar-fill { width: 100%; background: rgba(34,211,238,0.4); }
}
`;
