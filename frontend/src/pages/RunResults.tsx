import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Api, type EquityPoint, type Metrics, type PlotlyFigure, type Trade } from "@/api/client";
import { DrawdownChart } from "@/components/DrawdownChart";
import { EquityCurve } from "@/components/EquityCurve";
import { MetricsPanel } from "@/components/MetricsPanel";
import { MonthlyHeatmap } from "@/components/MonthlyHeatmap";
import { ReportCard } from "@/components/ReportCard";
import { RollingSharpChart } from "@/components/RollingSharpChart";
import { TradePnlChart } from "@/components/TradePnlChart";
import { TradeList } from "@/components/TradeList";

type ChartTab = "equity" | "drawdown" | "heatmap" | "trade_pnl" | "rolling_sharpe";

const CHART_TABS: { id: ChartTab; label: string }[] = [
  { id: "equity",         label: "Equity Curve"    },
  { id: "drawdown",       label: "Drawdown"         },
  { id: "heatmap",        label: "Monthly Returns"  },
  { id: "trade_pnl",      label: "Trade P&L"        },
  { id: "rolling_sharpe", label: "Rolling Sharpe"   },
];

export function RunResults() {
  const { runId } = useParams();
  const id = Number(runId);

  const reportRef = useRef<HTMLDivElement>(null);

  const [metrics,     setMetrics]     = useState<Metrics | null>(null);
  const [equityFig,   setEquityFig]   = useState<PlotlyFigure["figure"] | null>(null);
  const [drawdownFig, setDrawdownFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [equityData,  setEquityData]  = useState<EquityPoint[] | null>(null);
  const [trades,      setTrades]      = useState<Trade[]>([]);
  const [runDates,    setRunDates]    = useState<{ start: string; end: string; timeframe: string } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<ChartTab>("equity");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let active = true;

    Promise.all([
      Api.getMetrics(id),
      Api.getChart(id, "equity"),
      Api.getChart(id, "drawdown"),
      Api.getEquity(id),
      Api.getTrades(id),
      Api.getBacktest(id),
    ])
      .then(([m, eq, dd, ev, ts, run]) => {
        if (!active) return;
        setMetrics(m);
        setEquityFig(eq.figure);
        setDrawdownFig(dd.figure);
        setEquityData(ev);
        setTrades(ts);
        setRunDates({
          start: run.start_date.slice(0, 4),
          end: run.end_date.slice(0, 4),
          timeframe: run.timeframe,
        });
      })
      .catch((e) => { if (active) setError(String(e)); });

    return () => { active = false; };
  }, [id]);

  if (!Number.isFinite(id)) {
    return <div className="m-10 card border-accent-red text-accent-red">Invalid run ID.</div>;
  }

  return (
    <div className="px-10 py-8 pb-16 space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] mb-2 flex-wrap">
            <Link to="/" className="text-ink-muted hover:text-ink-primary transition-colors">
              Backtest
            </Link>
            <span className="text-border-subtle">/</span>
            <span className="text-accent-cyan font-mono font-medium">Run #{id}</span>
            {runDates && (
              <>
                <span className="text-border-subtle">&middot;</span>
                <span className="font-mono text-[12px] text-ink-muted">
                  {runDates.start}&ndash;{runDates.end}
                </span>
                <span className="text-border-subtle">&middot;</span>
                <span className="font-mono text-[12px] text-ink-muted">
                  {runDates.timeframe === "1h" ? "Hourly" : "Daily"}
                </span>
              </>
            )}
          </div>
          <h2 className="text-ink-primary">Backtest Results</h2>
        </div>

        <div className="flex gap-2.5">
          <button
            className="btn-secondary border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10"
            onClick={() => reportRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            AI Analysis
          </button>
          <Link to="/backtests/new" className="btn-secondary">
            Run New Backtest
          </Link>
        </div>
      </div>

      {error && (
        <div className="card border-accent-red text-accent-red text-sm">{error}</div>
      )}

      {/* ── 10-metric grid (2 rows × 5 cols) ────────────────────── */}
      <MetricsPanel metrics={metrics} />

      {/* ── Tabbed chart panel ──────────────────────────────────── */}
      <div className="border border-border rounded-lg overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center border-b border-border px-5 gap-0 bg-surface">
          {CHART_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveChart(t.id)}
              className={`px-4 py-3.5 text-[13px] border-b-2 transition-colors whitespace-nowrap ${
                activeChart === t.id
                  ? "border-accent-cyan text-accent-cyan"
                  : "border-transparent text-ink-muted hover:text-ink-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Chart body */}
        <div className="bg-surface">
          {activeChart === "equity"         && <EquityCurve      figure={equityFig}         />}
          {activeChart === "drawdown"       && <DrawdownChart    figure={drawdownFig}       />}
          {activeChart === "heatmap"        && <MonthlyHeatmap   equityData={equityData}    />}
          {activeChart === "trade_pnl"      && <TradePnlChart    trades={trades}            />}
          {activeChart === "rolling_sharpe" && <RollingSharpChart equityData={equityData}   />}
        </div>
      </div>

      {/* ── Trade log ───────────────────────────────────────────── */}
      <TradeList trades={trades} />

      {/* ── AI Report ───────────────────────────────────────────── */}
      <div ref={reportRef}>
        <ReportCard runId={id} />
      </div>
    </div>
  );
}
