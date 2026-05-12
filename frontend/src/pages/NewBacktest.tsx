import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Api, type Asset, type Strategy } from "@/api/client";
import { StrategyConfigForm } from "@/components/StrategyConfigForm";

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

// ── Component ─────────────────────────────────────────────────────────────────
export function NewBacktest() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const [assets, setAssets]         = useState<Asset[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [strategySlug, setStrategySlug] = useState<string | null>(null);
  const [assetClass, setAssetClass]     = useState<string>("equity");
  const [symbol, setSymbol]             = useState<string | null>(null);
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

  const years    = yearsBetween(start, end);
  const barCount = Math.round(years * 252);

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
      .catch((e) => setError(String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When asset class changes, reset symbol to first in that class
  useEffect(() => {
    setSymbol(classAssets[0]?.symbol ?? null);
  }, [assetClass]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit
  const submit = async () => {
    if (!symbol || !strategySlug) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await Api.submitBacktest({
        asset_symbol:  symbol,
        strategy_slug: strategySlug,
        start_date:    new Date(start).toISOString(),
        end_date:      new Date(end).toISOString(),
        params,
        initial_cash:    initialCash,
        commission_bps:  commissionBps,
        slippage_bps:    slippageBps,
        risk_fraction:   riskFraction,
      });
      navigate(`/backtests/${result.id}`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading screen while submitting ───────────────────────────────────────
  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-6">
        <div className="font-mono text-[11px] text-ink-muted tracking-[2px] uppercase">
          Running Backtest
        </div>
        <div className="font-mono text-accent-cyan text-base">
          Simulating {selectedStrategy?.name} on {symbol}...
        </div>
        <div className="w-72 h-[3px] bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan rounded-full animate-pulse w-3/5" />
        </div>
        <div className="font-mono text-xs text-ink-muted">
          {symbol} &middot; {start.slice(0, 4)}&ndash;{end.slice(0, 4)}
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
                      ? "bg-accent-cyan border-accent-cyan text-base font-semibold"
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

          {/* Backtest period */}
          <Section title="Backtest Period">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="label-base">Start Date</label>
                <input
                  type="date"
                  className="input-base"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="label-base">End Date</label>
                <input
                  type="date"
                  className="input-base"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              {years > 0 && (
                <div className="font-mono text-[12px] text-ink-muted pb-2 whitespace-nowrap">
                  {years.toFixed(1)} yrs &middot; ~{barCount.toLocaleString()} bars
                </div>
              )}
            </div>
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
              min={1000}
              hint="Starting portfolio value"
            />
            <NumField
              label="Commission (bps)"
              value={commissionBps}
              onChange={setCommBps}
              step={0.5}
              min={0}
              hint="Per trade, per leg"
            />
            <NumField
              label="Slippage (bps)"
              value={slippageBps}
              onChange={setSlipBps}
              step={0.5}
              min={0}
              hint="Market impact cost"
            />
            <NumField
              label="Risk Fraction"
              value={riskFraction}
              onChange={setRiskFraction}
              step={0.05}
              min={0}
              max={1}
              hint="Fraction of equity per position"
            />
          </div>

          {/* Summary */}
          <div className="card">
            <div className="section-title">Summary</div>
            <div className="flex flex-col divide-y divide-border">
              {[
                { label: "Strategy", val: selectedStrategy?.name ?? "—" },
                { label: "Asset",    val: symbol ?? "—" },
                { label: "Period",   val: years > 0 ? `${start.slice(0,4)} – ${end.slice(0,4)}` : "—" },
                { label: "Comm.",    val: `${commissionBps} bps` },
                { label: "Slippage", val: `${slippageBps} bps` },
                { label: "Capital",  val: `$${initialCash.toLocaleString()}` },
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
            className="w-full py-3.5 rounded-lg bg-accent-cyan text-base font-bold text-[15px]
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
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="label-base mb-0">{label}</label>
        <span className="font-mono text-[12px] text-accent-cyan">
          {label.includes("$") || label.includes("Capital")
            ? `$${Number(value).toLocaleString()}`
            : value}
        </span>
      </div>
      <input
        type="number"
        className="input-base"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <div className="text-[11px] text-ink-muted mt-1">{hint}</div>}
    </div>
  );
}
