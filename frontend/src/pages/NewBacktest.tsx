import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Api, type Asset, type Strategy } from "@/api/client";
import { AssetSelector } from "@/components/AssetSelector";
import { StrategyConfigForm } from "@/components/StrategyConfigForm";

/**
 * Wizard-style configuration page. We keep it on a single screen for
 * simplicity — fields are grouped into "What", "Parameters", "Execution".
 */
export function NewBacktest() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [symbol, setSymbol] = useState<string | null>(null);
  const [strategySlug, setStrategySlug] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [start, setStart] = useState<string>("2018-01-01");
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [initialCash, setInitialCash] = useState(10_000);
  const [commissionBps, setCommissionBps] = useState(5);
  const [slippageBps, setSlippageBps] = useState(2);
  const [riskFraction, setRiskFraction] = useState(1.0);

  useEffect(() => {
    Promise.all([Api.listAssets(), Api.listStrategies()])
      .then(([a, s]) => {
        setAssets(a);
        setStrategies(s);
        if (a.length > 0) setSymbol(a[0].symbol);
        if (s.length > 0) setStrategySlug(s[0].slug);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const selectedStrategy = strategies.find((s) => s.slug === strategySlug) ?? null;

  const submit = async () => {
    if (!symbol || !strategySlug) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await Api.submitBacktest({
        asset_symbol: symbol,
        strategy_slug: strategySlug,
        start_date: new Date(start).toISOString(),
        end_date: new Date(end).toISOString(),
        params,
        initial_cash: initialCash,
        commission_bps: commissionBps,
        slippage_bps: slippageBps,
        risk_fraction: riskFraction,
      });
      navigate(`/backtests/${result.id}`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1>New backtest</h1>

      {error && <div className="card text-accent-red text-sm">{error}</div>}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Asset + strategy ---------------------------------------------- */}
        <div className="card space-y-4">
          <h2>What</h2>
          <div>
            <label className="label-base">Asset</label>
            <AssetSelector assets={assets} value={symbol} onChange={setSymbol} />
          </div>
          <div>
            <label className="label-base">Strategy</label>
            <select
              className="input-base"
              value={strategySlug ?? ""}
              onChange={(e) => setStrategySlug(e.target.value)}
            >
              {strategies.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
            {selectedStrategy && (
              <p className="text-xs text-slate-500 mt-2">{selectedStrategy.description}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Start date</label>
              <input
                type="date"
                className="input-base"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="label-base">End date</label>
              <input
                type="date"
                className="input-base"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Parameters ------------------------------------------------------ */}
        <div className="card space-y-4">
          <h2>Parameters</h2>
          {selectedStrategy ? (
            <StrategyConfigForm
              schema={selectedStrategy.params_schema}
              onChange={setParams}
            />
          ) : (
            <div className="text-xs text-slate-500">Select a strategy to see its parameters.</div>
          )}
        </div>
      </div>

      {/* Execution ---------------------------------------------------------- */}
      <div className="card space-y-4">
        <h2>Execution model</h2>
        <p className="text-xs text-slate-500">
          Slippage and commissions are first-class user inputs — that's the point of stress-testing.
          Defaults are deliberately conservative for retail.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Initial cash ($)" value={initialCash} onChange={setInitialCash} step={1000} />
          <Field label="Commission (bps)" value={commissionBps} onChange={setCommissionBps} step={0.5} />
          <Field label="Slippage (bps)" value={slippageBps} onChange={setSlippageBps} step={0.5} />
          <Field
            label="Risk fraction"
            value={riskFraction}
            onChange={setRiskFraction}
            step={0.05}
            min={0}
            max={1}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button className="btn-primary" onClick={submit} disabled={submitting || !symbol || !strategySlug}>
          {submitting ? "Running…" : "Run backtest"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, step = 1, min, max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="label-base">{label}</label>
      <input
        type="number"
        className="input-base"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
