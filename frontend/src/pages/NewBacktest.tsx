import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Api, type Asset, type Strategy, type Timeframe } from "@/api/client";
import { StrategyConfigForm } from "@/components/StrategyConfigForm";
import { clamp, formatApiError, formatRange } from "@/utils/apiError";

// Engine-parameter bounds. Mirrors backend/api/schemas.py:BacktestRequest;
// keep these in sync if the Pydantic constraints change.
const RISK_FRACTION_MIN = 0.01;
const RISK_FRACTION_MAX = 1.0;
const INITIAL_CASH_MIN = 1000;
const BPS_MIN = 0;
const BPS_MAX = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByClass(assets: Asset[]): Record<string, Asset[]> {
  return assets.reduce<Record<string, Asset[]>>((acc, a) => {
    (acc[a.asset_class] ??= []).push(a);
    return acc;
  }, {});
}

function yearsBetween(start: string, end: string): number {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / (365.25 * 24 * 3600 * 1000));
}

// Mirrors backend/analytics/periods.py.
const BARS_PER_YEAR: Record<string, Record<Timeframe, number>> = {
  equity: { "1d": 252,  "1h": 1638 },
  etf:    { "1d": 252,  "1h": 1638 },
  fx:     { "1d": 260,  "1h": 6240 },
  crypto: { "1d": 365,  "1h": 8760 },
};

// yfinance hourly horizon — applies to equity/ETF/FX only. Crypto via
// Binance has multi-year hourly so no cap.
const HOURLY_HISTORY_DAYS = 730;
const YFINANCE_HOURLY_CLASSES = new Set(["equity", "etf", "fx"]);

// Cosmetic pipeline steps cycled through on the loading screen while the
// backtest API call is in flight — purely UI, not tied to real progress.
const PIPELINE_STEPS = [
  "Ingesting historical data...",
  "Cleaning & aligning price series...",
  "Generating strategy signals...",
  "Simulating order execution...",
  "Applying commission & slippage...",
  "Calculating portfolio equity...",
  "Computing risk metrics...",
  "Building performance report...",
];

// ── Component ─────────────────────────────────────────────────────────────────
export function NewBacktest() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const [assets, setAssets]         = useState<Asset[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Loading-screen animation state.
  const [stepIndex, setStepIndex]   = useState(0);
  const [progress, setProgress]     = useState(0);

  // Form state
  const [strategySlug, setStrategySlug] = useState<string | null>(null);
  const [assetClass, setAssetClass]     = useState<string>("equity");
  const [symbol, setSymbol]             = useState<string | null>(null);
  const [timeframe, setTimeframe]       = useState<Timeframe>("1d");
  const [params, setParams]             = useState<Record<string, unknown>>({});
  const [start, setStart]               = useState("2018-01-01");
  const [end, setEnd]                   = useState(new Date().toISOString().slice(0, 10));
  const [initialCash, setInitialCash]   = useState(100_000);
  const [commissionBps, setCommBps]     = useState(5);
  const [slippageBps, setSlipBps]       = useState(5);
  const [riskFraction, setRiskFraction] = useState(1.0);

  // Derived
  const grouped   = useMemo(() => groupByClass(assets), [assets]);
  const classes   = useMemo(() => Object.keys(grouped), [grouped]);
  const classAssets = grouped[assetClass] ?? [];

  const selectedStrategy = strategies.find((s) => s.slug === strategySlug) ?? null;

  const isHourlyCapped   = timeframe === "1h" && YFINANCE_HOURLY_CLASSES.has(assetClass);

  // Real dataset coverage for the selected (asset, timeframe) — bounds the pickers.
  const bounds  = assets.find((a) => a.symbol === symbol)?.coverage?.[timeframe];
  const dateMin = bounds?.first;
  const dateMax = bounds?.last;

  const years        = yearsBetween(start, end);
  const barsPerYear  = BARS_PER_YEAR[assetClass]?.[timeframe] ?? 252;
  const barCount     = Math.round(years * barsPerYear);

  // Snap the period into the dataset's available range whenever the asset or
  // timeframe changes, so the shown dates are always valid before "Run".
  useEffect(() => {
    if (!bounds) return;
    if (start < bounds.first)     setStart(bounds.first);
    else if (start > bounds.last) setStart(bounds.last);
    if (end > bounds.last)        setEnd(bounds.last);
    else if (end < bounds.first)  setEnd(bounds.first);
  }, [bounds?.first, bounds?.last]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load assets + strategies on mount
  useEffect(() => {
    Promise.all([Api.listAssets(), Api.listStrategies()])
      .then(([a, s]) => {
        setAssets(a);
        setStrategies(s);

        // Pre-select strategy from URL param (?strategy=slug)
        const slugParam = searchParams.get("strategy");
        const firstSlug = slugParam && s.find((x) => x.slug === slugParam)
          ? slugParam
          : s[0]?.slug ?? null;
        setStrategySlug(firstSlug);

        // Pre-select first asset class + symbol
        const groups = groupByClass(a);
        const firstClass = Object.keys(groups)[0] ?? "equity";
        setAssetClass(firstClass);
        setSymbol(groups[firstClass]?.[0]?.symbol ?? null);
      })
      .catch((e) => setError(formatApiError(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When asset class changes, reset symbol to first in that class
  useEffect(() => {
    setSymbol(classAssets[0]?.symbol ?? null);
  }, [assetClass]); // eslint-disable-line react-hooks/exhaustive-deps

  // While submitting: cycle the status message and ease the progress bar
  // toward ~80% (it jumps to 100% when the response lands, in submit()).
  useEffect(() => {
    if (!submitting) return;
    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i + 1) % PIPELINE_STEPS.length);
    }, 350);
    const progressTimer = setInterval(() => {
      setProgress((p) => (p >= 80 ? p : p + (80 - p) * 0.08));
    }, 100);
    return () => {
      clearInterval(stepTimer);
      clearInterval(progressTimer);
    };
  }, [submitting]);

  // Submit
  const submit = async () => {
    if (!symbol || !strategySlug) return;
    setStepIndex(0);
    setProgress(0);
    setSubmitting(true);
    setError(null);
    try {
      const result = await Api.submitBacktest({
        asset_symbol:  symbol,
        strategy_slug: strategySlug,
        start_date:    new Date(start).toISOString(),
        end_date:      new Date(end).toISOString(),
        params,
        initial_cash:    clamp(initialCash, INITIAL_CASH_MIN),
        commission_bps:  clamp(commissionBps, BPS_MIN, BPS_MAX),
        slippage_bps:    clamp(slippageBps, BPS_MIN, BPS_MAX),
        risk_fraction:   clamp(riskFraction, RISK_FRACTION_MIN, RISK_FRACTION_MAX),
        timeframe,
      });
      // Snap the bar to 100%, let it render briefly, then go to results.
      setProgress(100);
      setTimeout(() => navigate(`/backtests/${result.id}`), 250);
    } catch (e: unknown) {
      setError(formatApiError(e));
      setSubmitting(false);
    }
  };

  // ── Loading screen while submitting ───────────────────────────────────────
  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[78vh] bg-base px-6">
        {/* 1. Header */}
        <div className="font-mono text-[11px] uppercase tracking-[2px] text-ink-muted">
          Running Backtest
        </div>

        {/* 2. Cycling status message with blinking cursor */}
        <div className="font-mono text-accent-cyan text-base mt-4">
          {PIPELINE_STEPS[stepIndex]}
          <span className="animate-blink">_</span>
        </div>

        {/* 3. Progress bar — eases to ~80%, snaps to 100% on response */}
        <div className="w-72 h-[3px] rounded-full overflow-hidden mt-5 bg-border">
          <div
            className="h-full bg-accent-cyan transition-[width] duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 4. Context line */}
        <div className="font-mono text-xs text-ink-muted mt-4">
          {selectedStrategy?.name ?? "—"} &middot; {symbol} &middot;{" "}
          {start.slice(0, 4)}&ndash;{end.slice(0, 4)}
        </div>
      </div>
    );
  }

  return (
    <div className="px-10 py-8 pb-16">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-7">
        <Link to="/strategies" className="font-mono text-[11px] text-ink-muted hover:text-ink-primary transition-colors mb-3 inline-block">
          &larr; Back to Library
        </Link>
        <h2 className="text-ink-primary">Configure Backtest</h2>
        {selectedStrategy && (
          <p className="text-ink-muted text-sm mt-1">
            Set parameters for{" "}
            <span className="text-accent-cyan font-medium">{selectedStrategy.name}</span>
          </p>
        )}
      </div>

      {error && (
        <div className="card border-accent-red text-accent-red text-sm mb-6">{error}</div>
      )}

      <div className="flex gap-7 items-start">

        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Strategy selector */}
          <Section title="Strategy">
            <select
              className="input-base"
              value={strategySlug ?? ""}
              onChange={(e) => setStrategySlug(e.target.value)}
            >
              {strategies.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
            {selectedStrategy && (
              <p className="text-[12px] text-ink-muted mt-2 leading-relaxed">
                {selectedStrategy.description}
              </p>
            )}
          </Section>

          {/* Asset class tabs */}
          <Section title="Asset Class">
            <div className="flex gap-2 flex-wrap">
              {classes.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setAssetClass(cls)}
                  className={`px-4 py-1.5 rounded-md border text-[13px] transition-all ${
                    assetClass === cls
                      ? "bg-accent-cyan border-accent-cyan text-[#0d1117] font-semibold"
                      : "border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border"
                  }`}
                >
                  {cls.charAt(0).toUpperCase() + cls.slice(1)}
                </button>
              ))}
            </div>
          </Section>

          {/* Asset grid */}
          <Section title="Instrument">
            {classAssets.length === 0 ? (
              <div className="text-ink-muted text-sm">Loading assets...</div>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}
              >
                {classAssets.map((a) => (
                  <button
                    key={a.symbol}
                    onClick={() => setSymbol(a.symbol)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-md border text-left transition-all ${
                      symbol === a.symbol
                        ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10"
                        : "border-border-subtle text-ink-primary hover:border-border"
                    }`}
                  >
                    <span className="font-mono text-[13px] font-semibold">{a.symbol}</span>
                    <span className="text-[11px] text-ink-muted">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Timeframe */}
          <Section title="Timeframe">
            <div className="flex gap-2">
              {(["1d", "1h"] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-4 py-1.5 rounded-md border text-[13px] transition-all ${
                    timeframe === tf
                      ? "bg-accent-cyan border-accent-cyan text-[#0d1117] font-semibold"
                      : "border-border-subtle text-ink-muted hover:text-ink-primary hover:border-border"
                  }`}
                >
                  {tf === "1d" ? "Daily" : "Hourly"}
                </button>
              ))}
            </div>
            {timeframe === "1h" && isHourlyCapped && (
              <p className="text-[11px] text-ink-muted mt-2">
                Hourly history limited to ~{HOURLY_HISTORY_DAYS} days for {assetClass.toUpperCase()} (yfinance constraint).
              </p>
            )}
            {timeframe === "1h" && !isHourlyCapped && (
              <p className="text-[11px] text-ink-muted mt-2">
                Crypto hourly via Binance — multi-year history (back to ~2017 for BTC).
              </p>
            )}
          </Section>

          {/* Backtest period */}
          <Section title="Backtest Period">
            <div className="flex items-end gap-4 flex-wrap">
              <DateField label="Start Date" value={start} min={dateMin} max={dateMax} onCommit={setStart} />
              <DateField label="End Date"   value={end}   min={dateMin} max={dateMax} onCommit={setEnd} />
              {years > 0 && (
                <div className="font-mono text-[12px] text-ink-muted pb-2 whitespace-nowrap">
                  {years.toFixed(1)} yrs &middot; ~{barCount.toLocaleString()} bars
                </div>
              )}
            </div>
            {bounds && (
              <p className="text-[11px] text-ink-muted mt-2">
                Available data: <span className="font-mono">{bounds.first}</span> &ndash;{" "}
                <span className="font-mono">{bounds.last}</span> &middot; out-of-range dates snap to these bounds.
              </p>
            )}
          </Section>

          {/* Strategy parameters */}
          <Section title="Strategy Parameters">
            {selectedStrategy ? (
              <StrategyConfigForm schema={selectedStrategy.params_schema} onChange={setParams} />
            ) : (
              <div className="text-sm text-ink-muted">Select a strategy to see its parameters.</div>
            )}
          </Section>
        </div>

        {/* ── Right sidebar ────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-[280px] flex flex-col gap-4">

          {/* Execution settings */}
          <div className="card space-y-4">
            <div className="section-title">Execution Settings</div>
            <NumField
              label="Initial Capital ($)"
              value={initialCash}
              onChange={setInitialCash}
              step={10000}
              min={INITIAL_CASH_MIN}
              hint="Starting portfolio value"
            />
            <NumField
              label="Commission (bps)"
              value={commissionBps}
              onChange={setCommBps}
              step={0.5}
              min={BPS_MIN}
              max={BPS_MAX}
              hint="Per trade, per leg"
            />
            <NumField
              label="Slippage (bps)"
              value={slippageBps}
              onChange={setSlipBps}
              step={0.5}
              min={BPS_MIN}
              max={BPS_MAX}
              hint="Market impact cost"
            />
            <NumField
              label="Risk Fraction"
              value={riskFraction}
              onChange={setRiskFraction}
              step={0.05}
              min={RISK_FRACTION_MIN}
              max={RISK_FRACTION_MAX}
              hint="Fraction of equity per position"
            />
          </div>

          {/* Summary */}
          <div className="card">
            <div className="section-title">Summary</div>
            <div className="flex flex-col divide-y divide-border">
              {[
                { label: "Strategy",  val: selectedStrategy?.name ?? "—" },
                { label: "Asset",     val: symbol ?? "—" },
                { label: "Timeframe", val: timeframe === "1d" ? "Daily" : "Hourly" },
                { label: "Period",    val: years > 0 ? `${start.slice(0,4)} – ${end.slice(0,4)}` : "—" },
                { label: "Comm.",     val: `${commissionBps} bps` },
                { label: "Slippage",  val: `${slippageBps} bps` },
                { label: "Capital",   val: `$${initialCash.toLocaleString()}` },
              ].map((r) => (
                <div key={r.label} className="flex justify-between items-center py-2">
                  <span className="text-ink-muted text-[12px]">{r.label}</span>
                  <span className="font-mono text-[12px] text-ink-primary">{r.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Run button */}
          <button
            className="w-full py-3.5 rounded-lg bg-accent-cyan text-[#0d1117] font-bold text-[15px]
                       hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            onClick={submit}
            disabled={!symbol || !strategySlug}
          >
            Run Backtest
          </button>
          <p className="text-center font-mono text-[11px] text-ink-muted -mt-2">
            ~2s simulation time
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Date parsing + clamping for the text-based period fields ────────────────────
function clampISO(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/**
 * Parse free-typed input into a clamped ISO yyyy-mm-dd. Accepts a full date
 * (forgiving separators / widths, or yyyymmdd) or a bare year (→ Jan 1).
 * Unparseable or impossible dates revert to `fallback`, so the field never
 * commits garbage; valid dates are clamped into [min, max].
 */
function normalizeDate(raw: string, fallback: string, min?: string, max?: string): string {
  const s = raw.trim();
  if (/^\d{1,4}$/.test(s)) return clampISO(`${s.padStart(4, "0")}-01-01`, min, max);
  const m =
    s.match(/^(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})$/) ?? s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return fallback;
  const iso = `${m[1].padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return fallback;
  return clampISO(iso, min, max);
}

// ── Date input — text field, validated + clamped on blur ────────────────────────
// A plain text draft (not a native date input) so keystrokes can never be
// reset mid-typing in any browser. On blur the value is parsed, clamped into the
// dataset's [min, max] bounds, and committed. The "Run Backtest" click blurs the
// field first, so submit still reads the committed value.
function DateField({
  label, value, min, max, onCommit,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft]     = useState(value);
  const [focused, setFocused] = useState(false);

  // Pull external changes in (initial load, asset/timeframe snap) only while the
  // user isn't editing, so we never clobber in-progress input.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const next = normalizeDate(draft, value, min, max);
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex-1 min-w-[140px]">
      <label className="label-base">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        className="input-base"
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

// ── Number input field ────────────────────────────────────────────────────────
function NumField({
  label, value, onChange, step = 1, min, max, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const range = formatRange(min, max);
  const display = Number.isFinite(value)
    ? (label.includes("$") || label.includes("Capital") ? `$${value.toLocaleString()}` : value)
    : "—";
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="label-base mb-0">{label}</label>
        <span className="font-mono text-[12px] text-accent-cyan">{display}</span>
      </div>
      <input
        type="number"
        className="input-base"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value === "") { onChange(NaN); return; }
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const c = clamp(value, min, max);
          if (c !== value) onChange(c);
        }}
      />
      <div className="text-[11px] text-ink-muted mt-1">
        {hint}
        {hint && range && " · "}
        {range && <span>Range: {range}</span>}
      </div>
    </div>
  );
}
