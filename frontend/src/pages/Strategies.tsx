import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Api, type Strategy } from "@/api/client";

// ── Static metadata (mirrors data-engine.jsx + backend/strategies/) ───────────
interface StrategyMeta {
  abbr: string;
  complexity: 1 | 2 | 3;
  badge: string | null;
  assets: string[];
  profile: { cagr: number; winRate: number };
}

const STRATEGY_META: Record<string, StrategyMeta> = {
  "sma-crossover": {
    abbr: "SMA-X",
    complexity: 1,
    badge: "Classic",
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.12, winRate: 0.42 },
  },
  "macd-crossover": {
    abbr: "MACD",
    complexity: 2,
    badge: "Popular",
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.14, winRate: 0.46 },
  },
  "ichimoku-cloud": {
    abbr: "ICH",
    complexity: 3,
    badge: null,
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.15, winRate: 0.48 },
  },
  "donchian-breakout": {
    abbr: "DON",
    complexity: 1,
    badge: "Turtle",
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.17, winRate: 0.35 },
  },
  "keltner-channels": {
    abbr: "KC",
    complexity: 2,
    badge: null,
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.13, winRate: 0.40 },
  },
  "time-series-momentum": {
    abbr: "TSM",
    complexity: 1,
    badge: "Academic",
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.16, winRate: 0.44 },
  },
  "rsi-mean-reversion": {
    abbr: "RSI-MR",
    complexity: 1,
    badge: "Popular",
    assets: ["Equities", "Crypto"],
    profile: { cagr: 0.19, winRate: 0.62 },
  },
  "bollinger-bands": {
    abbr: "BB",
    complexity: 2,
    badge: null,
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.11, winRate: 0.55 },
  },
  "stochastic-oscillator": {
    abbr: "STO",
    complexity: 1,
    badge: null,
    assets: ["Equities", "FX"],
    profile: { cagr: 0.10, winRate: 0.58 },
  },
  "cci": {
    abbr: "CCI",
    complexity: 2,
    badge: null,
    assets: ["Equities", "FX", "Crypto"],
    profile: { cagr: 0.12, winRate: 0.57 },
  },
};

const COMPLEXITY_LABEL: Record<number, string> = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };
const COMPLEXITY_COLOR: Record<number, string> = {
  1: "text-accent-green",
  2: "text-accent-amber",
  3: "text-accent-red",
};

const CATEGORIES = ["All", "Trend Following", "Momentum", "Breakout", "Mean Reversion"];

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

  const filtered =
    filter === "All"
      ? strategies
      : strategies.filter((s) => s.category === filter);

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
              {/* Top: abbr + badge */}
              <div className="flex items-start justify-between gap-2">
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

              {/* Name + category */}
              <div>
                <h3 className="text-ink-primary text-[15px] font-semibold mb-0.5">{s.name}</h3>
                {meta && (
                  <span className={`font-mono text-[11px] ${COMPLEXITY_COLOR[meta.complexity]}`}>
                    {s.category}
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-ink-muted text-[13px] leading-relaxed flex-1">{s.description}</p>

              {/* Meta stats */}
              {meta && (
                <div className="flex border-t border-b border-border py-2.5 gap-0">
                  <MetaStat label="CAGR (hist.)" value={`~${(meta.profile.cagr * 100).toFixed(0)}%`} valueClass="text-accent-green" />
                  <MetaStat label="Win Rate"     value={`${(meta.profile.winRate * 100).toFixed(0)}%`} />
                  <MetaStat
                    label="Level"
                    value={COMPLEXITY_LABEL[meta.complexity]}
                    valueClass={COMPLEXITY_COLOR[meta.complexity]}
                  />
                </div>
              )}

              {/* Footer: asset tags + SELECT */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {(meta?.assets ?? []).map((a) => (
                    <span
                      key={a}
                      className="font-mono text-[10px] text-ink-muted border border-border-subtle rounded px-2 py-0.5"
                    >
                      {a}
                    </span>
                  ))}
                </div>
                <span
                  className={`font-mono text-[11px] tracking-wider transition-colors ${
                    isHovered ? "text-accent-cyan" : "text-ink-muted"
                  }`}
                >
                  SELECT
                </span>
              </div>
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

// ── Inline helper ─────────────────────────────────────────────────────────────
function MetaStat({
  label, value, valueClass = "text-ink-primary",
}: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex-1 flex flex-col gap-1 pr-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">{label}</span>
      <span className={`font-mono text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
