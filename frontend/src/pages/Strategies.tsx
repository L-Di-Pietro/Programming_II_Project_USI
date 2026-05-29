import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Api, type Strategy } from "@/api/client";
import { PipelineLoadingScreen } from "@/components/PipelineLoadingScreen";

// ── Static metadata (mirrors data-engine.jsx + backend/strategies/) ───────────
interface StrategyMeta {
  abbr: string;
  complexity: 1 | 2 | 3;
  badge: string | null;
}

const STRATEGY_META: Record<string, StrategyMeta> = {
  "sma-crossover":         { abbr: "SMA-X",  complexity: 1, badge: "Classic" },
  "macd-crossover":        { abbr: "MACD",   complexity: 2, badge: "Popular" },
  "ichimoku-cloud":        { abbr: "ICH",    complexity: 3, badge: null },
  "donchian-breakout":     { abbr: "DON",    complexity: 1, badge: "Turtle" },
  "keltner-channels":      { abbr: "KC",     complexity: 2, badge: null },
  "time-series-momentum":  { abbr: "TSM",    complexity: 1, badge: "Academic" },
  "rsi-mean-reversion":    { abbr: "RSI-MR", complexity: 1, badge: "Popular" },
  "bollinger-bands":       { abbr: "BB",     complexity: 2, badge: null },
  "stochastic-oscillator": { abbr: "STO",    complexity: 1, badge: null },
  "cci":                   { abbr: "CCI",    complexity: 2, badge: null },
};

const COMPLEXITY_LABEL: Record<number, string> = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };
const COMPLEXITY_BADGE: Record<number, string> = {
  1: "border-accent-green text-accent-green",
  2: "border-accent-amber text-accent-amber",
  3: "border-accent-red   text-accent-red",
};

const CATEGORIES = ["All", "Trend Following", "Momentum", "Breakout", "Mean Reversion"];

// Cosmetic status lines cycled through while the strategy library loads.
const LOADING_MESSAGES = [
  "Fetching strategy library...",
  "Loading parameter schemas...",
  "Organizing by category...",
  "Preparing strategy cards...",
];

// ── Component ─────────────────────────────────────────────────────────────────
export function Strategies() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState("All");
  const [hovered, setHovered]       = useState<string | null>(null);

  useEffect(() => {
    Api.listStrategies().then(setStrategies).catch((e) => setError(String(e)));
  }, []);

  // ── Initial-load gate ──────────────────────────────────────────────────────
  // The loader replaces the page until the strategy list is in. Progress eases
  // toward ~80% while loading, then snaps to 100% once ready. Mirrors the
  // Configure and Results pages so the handoff feels consistent.
  const isReady = strategies.length > 0 || error !== null;
  const mountRef = useRef(performance.now());
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaderDone, setLoaderDone]     = useState(false);
  useEffect(() => {
    if (loaderDone) return;
    if (isReady) {
      setLoadProgress(100);
      const MIN_MS = 900; // min on-screen time so a fast load doesn't just flash
      const wait = Math.max(0, MIN_MS - (performance.now() - mountRef.current));
      const t = setTimeout(() => setLoaderDone(true), wait);
      return () => clearTimeout(t);
    }
    const progressTimer = setInterval(() => {
      setLoadProgress((p) => (p >= 80 ? p : p + (80 - p) * 0.08));
    }, 100);
    return () => clearInterval(progressTimer);
  }, [isReady, loaderDone]);

  const filtered =
    filter === "All"
      ? strategies
      : strategies.filter((s) => s.category === filter);

  // ── Loading screen while the strategy library loads ──────────────────────
  if (!loaderDone) {
    return (
      <PipelineLoadingScreen
        title="Loading Strategies"
        messages={LOADING_MESSAGES}
        progress={loadProgress}
      />
    );
  }

  return (
    <div className="px-10 py-10 pb-16">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-7">
        <h2 className="text-ink-primary mb-2">Strategy Library</h2>
        <p className="text-ink-muted text-sm">
          {strategies.length} institutional-grade quant strategies. Select one to configure and backtest.
        </p>
      </div>

      {error && (
        <div className="card border-accent-red text-accent-red text-sm mb-6">{error}</div>
      )}

      {/* ── Category filter bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-7 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-4 py-1.5 rounded-full border text-[13px] transition-all ${
              filter === c
                ? "bg-accent-cyan border-accent-cyan text-base font-semibold"
                : "border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-ink-muted">
          {filtered.length} {filtered.length === 1 ? "strategy" : "strategies"}
        </span>
      </div>

      {/* ── Strategy grid ───────────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {filtered.map((s) => {
          const meta = STRATEGY_META[s.slug];
          const isHovered = hovered === s.slug;

          return (
            <div
              key={s.slug}
              onMouseEnter={() => setHovered(s.slug)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => navigate(`/backtests/new?strategy=${s.slug}`)}
              className={`flex flex-col gap-3 rounded-lg p-5 border cursor-pointer transition-all ${
                isHovered
                  ? "border-accent-cyan bg-surface"
                  : "border-border-subtle bg-base"
              }`}
            >
              {/* Top: abbr + category badge on the left, level badge on the right */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`tag-mono border-accent-cyan text-accent-cyan ${
                      isHovered ? "bg-accent-cyan/10" : ""
                    }`}
                  >
                    {meta?.abbr ?? s.slug.toUpperCase()}
                  </span>
                  {meta?.badge && (
                    <span
                      className={`tag-mono transition-colors ${
                        isHovered
                          ? "border-accent-cyan text-accent-cyan"
                          : "border-border-subtle text-ink-muted"
                      }`}
                    >
                      {meta.badge}
                    </span>
                  )}
                </div>
                {meta && (
                  <span className={`tag-mono ${COMPLEXITY_BADGE[meta.complexity]}`}>
                    {COMPLEXITY_LABEL[meta.complexity]}
                  </span>
                )}
              </div>

              {/* Name */}
              <h3 className="text-ink-primary text-[15px] font-semibold">{s.name}</h3>

              {/* Description */}
              <p className="text-ink-muted text-[13px] leading-relaxed flex-1">{s.description}</p>
            </div>
          );
        })}

        {strategies.length === 0 && !error && (
          <div className="card text-ink-muted text-sm col-span-full text-center py-10">
            Loading strategies...
          </div>
        )}
      </div>
    </div>
  );
}

