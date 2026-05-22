import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Api,
  type BenchmarkKind,
  type EquityPoint,
  type Metrics,
  type PlotlyFigure,
  type Trade,
} from "@/api/client";
import { BENCHMARKS, STRATEGY, type BenchmarkSeries } from "@/components/benchmarks";
import { BenchmarkToggleBar, type BenchmarkState } from "@/components/BenchmarkToggleBar";
import { DrawdownChart } from "@/components/DrawdownChart";
import { EquityCurve, type ChartLegendItem } from "@/components/EquityCurve";
import { MetricsPanel, type BenchmarkMetricSeries } from "@/components/MetricsPanel";
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

// Per-benchmark fetch state. Loaded entries carry the data and are cached for
// the lifetime of the page — toggling off keeps the cache (no refetch).
type BenchEntry =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; metrics: Metrics; equity: EquityPoint[] };

function pillState(entry?: BenchEntry): BenchmarkState {
  if (entry?.status === "loading") return "loading";
  if (entry?.status === "error") return "error";
  return "idle";
}

export function RunResults() {
  const { runId } = useParams();
  const id = Number(runId);

  const reportRef = useRef<HTMLDivElement>(null);

  const [metrics,     setMetrics]     = useState<Metrics | null>(null);
  const [equityFig,   setEquityFig]   = useState<PlotlyFigure["figure"] | null>(null);
  const [drawdownFig, setDrawdownFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [equityData,  setEquityData]  = useState<EquityPoint[] | null>(null);
  const [trades,      setTrades]      = useState<Trade[]>([]);
  const [runInfo,     setRunInfo]     = useState<{
    strategyName: string;
    asset: string;
    startYear: string;
    endYear: string;
  } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<ChartTab>("equity");

  // Benchmark overlays: which pills are on + a per-kind data cache.
  const [activeBenchmarks, setActiveBenchmarks] = useState<Set<BenchmarkKind>>(new Set());
  const [benchData, setBenchData] = useState<Partial<Record<BenchmarkKind, BenchEntry>>>({});

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
        setRunInfo({
          strategyName: run.strategy_name,
          asset: run.asset_symbol,
          startYear: run.start_date.slice(0, 4),
          endYear: run.end_date.slice(0, 4),
        });
      })
      .catch((e) => { if (active) setError(String(e)); });

    return () => { active = false; };
  }, [id]);

  function toggleBenchmark(kind: BenchmarkKind) {
    // Turning OFF — keep the cache so re-enabling doesn't refetch.
    if (activeBenchmarks.has(kind)) {
      setActiveBenchmarks((prev) => {
        const next = new Set(prev);
        next.delete(kind);
        return next;
      });
      return;
    }
    // Turning ON — use the cache if present, else lazily fetch once.
    if (benchData[kind]?.status === "loaded") {
      setActiveBenchmarks((prev) => new Set(prev).add(kind));
      return;
    }
    setBenchData((prev) => ({ ...prev, [kind]: { status: "loading" } }));
    Promise.all([Api.getBenchmarkMetrics(id, kind), Api.getBenchmarkEquity(id, kind)])
      .then(([m, eq]) => {
        setBenchData((prev) => ({ ...prev, [kind]: { status: "loaded", metrics: m, equity: eq } }));
        setActiveBenchmarks((prev) => new Set(prev).add(kind));
      })
      .catch(() => {
        // Leave the pill inactive; it surfaces an "unavailable" tooltip.
        setBenchData((prev) => ({ ...prev, [kind]: { status: "error" } }));
      });
  }

  // Active + successfully-loaded benchmarks, in stable config order.
  const loadedActive = BENCHMARKS.filter(
    (b) => activeBenchmarks.has(b.kind) && benchData[b.kind]?.status === "loaded",
  );

  const metricsBenchmarks: BenchmarkMetricSeries[] = loadedActive.map((b) => ({
    kind: b.kind,
    tag: b.tag,
    tagClass: b.tagClass,
    metrics: (benchData[b.kind] as Extract<BenchEntry, { status: "loaded" }>).metrics,
  }));

  // Active + loaded benchmarks paired with their cached equity — for the
  // Drawdown / Monthly / Rolling-Sharpe overlays (no refetch).
  const benchmarkSeries: BenchmarkSeries[] = loadedActive.map((b) => ({
    kind: b.kind,
    tag: b.tag,
    label: b.label,
    hex: b.hex,
    tagClass: b.tagClass,
    equity: (benchData[b.kind] as Extract<BenchEntry, { status: "loaded" }>).equity,
  }));

  // Strategy-only figure from the backend, with active benchmark lines injected
  // client-side. Memoised on the inputs that actually move the chart.
  const equityFigWithOverlays = useMemo(() => {
    if (!equityFig) return equityFig;
    const overlays = BENCHMARKS.filter(
      (b) => activeBenchmarks.has(b.kind) && benchData[b.kind]?.status === "loaded",
    ).map((b) => {
      const eq = (benchData[b.kind] as Extract<BenchEntry, { status: "loaded" }>).equity;
      return {
        x: eq.map((p) => p.ts),
        y: eq.map((p) => p.equity),
        mode: "lines",
        name: b.label,
        line: { color: b.hex, width: 1.8 },
        hovertemplate: "%{x|%Y-%m-%d}<br>$%{y:,.0f}<extra></extra>",
      };
    });
    if (overlays.length === 0) return equityFig;
    return { ...equityFig, data: [...equityFig.data, ...overlays] };
  }, [equityFig, activeBenchmarks, benchData]);

  // Always show the inline legend over the chart — even strategy-only.
  const chartLegend: ChartLegendItem[] = [
    { label: STRATEGY.label, hex: STRATEGY.hex },
    ...loadedActive.map((b) => ({ label: b.label, hex: b.hex })),
  ];

  const benchState: Record<BenchmarkKind, BenchmarkState> = {
    buy_and_hold: pillState(benchData.buy_and_hold),
    sp500: pillState(benchData.sp500),
  };

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
            {runInfo && (
              <>
                <Link
                  to="/strategies"
                  className="text-accent-cyan font-medium hover:underline underline-offset-2"
                >
                  {runInfo.strategyName}
                </Link>
                <span className="text-border-subtle">&middot;</span>
                <span className="font-mono text-[12px] text-ink-muted">
                  {runInfo.asset}
                </span>
                <span className="text-border-subtle">&middot;</span>
                <span className="font-mono text-[12px] text-ink-muted">
                  {runInfo.startYear}&ndash;{runInfo.endYear}
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

      {/* ── Benchmark comparison toggle ─────────────────────────── */}
      <BenchmarkToggleBar
        active={activeBenchmarks}
        state={benchState}
        onToggle={toggleBenchmark}
      />

      {error && (
        <div className="card border-accent-red text-accent-red text-sm">{error}</div>
      )}

      {/* ── 10-metric grid (2 rows × 5 cols) ────────────────────── */}
      <MetricsPanel metrics={metrics} benchmarks={metricsBenchmarks} />

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

        {/* Chart body — every tab responds to the active benchmarks. */}
        <div className="bg-surface">
          {activeChart === "equity"         && <EquityCurve      figure={equityFigWithOverlays} legend={chartLegend} />}
          {activeChart === "drawdown"       && <DrawdownChart    figure={drawdownFig}    benchmarks={benchmarkSeries} />}
          {activeChart === "heatmap"        && <MonthlyHeatmap   equityData={equityData} benchmarks={benchmarkSeries} />}
          {activeChart === "trade_pnl"      && <TradePnlChart    trades={trades} showBenchmarkNote={activeBenchmarks.size > 0} />}
          {activeChart === "rolling_sharpe" && <RollingSharpChart equityData={equityData} benchmarks={benchmarkSeries} />}
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
