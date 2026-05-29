import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

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
import { ConfigPopover } from "@/components/ConfigPopover";
import { DrawdownChart } from "@/components/DrawdownChart";
import { EquityCurve, type ChartLegendItem } from "@/components/EquityCurve";
import { MetricsPanel, type BenchmarkMetricSeries } from "@/components/MetricsPanel";
import { MonthlyHeatmap } from "@/components/MonthlyHeatmap";
import { AIAnalystModal } from "@/components/AIAnalystModal";
import { RollingSharpChart } from "@/components/RollingSharpChart";
import { TradePnlChart } from "@/components/TradePnlChart";
import { TradeList } from "@/components/TradeList";
import { PipelineLoadingScreen } from "@/components/PipelineLoadingScreen";
import { fmtBacktestDate } from "@/utils/datetime";

type ChartTab = "equity" | "drawdown" | "heatmap" | "trade_pnl" | "rolling_sharpe";

const CHART_TABS: { id: ChartTab; label: string }[] = [
  { id: "equity",         label: "Equity Curve"    },
  { id: "drawdown",       label: "Drawdown"         },
  { id: "heatmap",        label: "Monthly Returns"  },
  { id: "trade_pnl",      label: "Trade P&L"        },
  { id: "rolling_sharpe", label: "Rolling Sharpe"   },
];

// Results-specific cycling labels for the shared loading screen.
const LOADING_MESSAGES = [
  "Loading backtest data...",
  "Fetching equity curve...",
  "Loading trade log...",
  "Computing benchmark overlays...",
  "Preparing performance metrics...",
  "Rendering charts...",
];

/** Run header info shown above the charts. */
interface RunInfo {
  strategyName: string;
  asset: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  params: Record<string, unknown>;
}

/**
 * Results payload handed over via router state when a run is launched from the
 * Configure page — lets the Results page render immediately, fully populated,
 * with no second "Loading Results" screen. Absent for every other entry point
 * (Dashboard row, sidebar, direct URL), which fall back to fetching on mount.
 */
export interface PreloadedResults {
  runId: number;
  runInfo: RunInfo;
  metrics: Metrics;
  equityFigure: PlotlyFigure["figure"];
  drawdownFigure: PlotlyFigure["figure"];
  equityData: EquityPoint[];
  trades: Trade[];
}

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
  const location = useLocation();

  // Data handed over from the Configure page after a run — present only for the
  // run→view flow. Validated against the URL id so stale history state for a
  // different run is ignored.
  const preloaded = useMemo<PreloadedResults | undefined>(() => {
    const p = (location.state as { preloaded?: PreloadedResults } | null)?.preloaded;
    return p && p.runId === id ? p : undefined;
  }, [location.state, id]);

  const [metrics,     setMetrics]     = useState<Metrics | null>(preloaded?.metrics ?? null);
  const [equityFig,   setEquityFig]   = useState<PlotlyFigure["figure"] | null>(preloaded?.equityFigure ?? null);
  const [drawdownFig, setDrawdownFig] = useState<PlotlyFigure["figure"] | null>(preloaded?.drawdownFigure ?? null);
  const [equityData,  setEquityData]  = useState<EquityPoint[] | null>(preloaded?.equityData ?? null);
  const [trades,      setTrades]      = useState<Trade[]>(preloaded?.trades ?? []);
  const [runInfo,     setRunInfo]     = useState<RunInfo | null>(preloaded?.runInfo ?? null);
  const [error,       setError]       = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<ChartTab>("equity");
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Benchmark overlays: which pills are on + a per-kind data cache.
  const [activeBenchmarks, setActiveBenchmarks] = useState<Set<BenchmarkKind>>(new Set());
  const [benchData, setBenchData] = useState<Partial<Record<BenchmarkKind, BenchEntry>>>({});

  useEffect(() => {
    if (!Number.isFinite(id)) { setError("Invalid run id."); return; }
    // Data already supplied by the Configure handoff — nothing to fetch.
    if (preloaded) return;
    let active = true;
    let pollTimer: number | undefined;

    (async () => {
      try {
        // Wait until the backtest has finished computing on the backend, so the
        // loader stays up for an in-progress run instead of erroring out.
        let run = await Api.getBacktest(id);
        while (active && (run.status === "pending" || run.status === "running")) {
          await new Promise((r) => { pollTimer = window.setTimeout(r, 1200); });
          if (!active) return;
          run = await Api.getBacktest(id);
        }
        if (!active) return;
        if (run.status === "failed") {
          setError(run.error_message || "Backtest failed.");
          return;
        }

        // Run details are known now — set them early so the loading screen's
        // context line (strategy · asset · period) shows while charts fetch.
        setRunInfo({
          strategyName: run.strategy_name,
          asset: run.asset_symbol,
          startDate: run.start_date,
          endDate: run.end_date,
          timeframe: run.timeframe,
          params: run.params,
        });

        // Completed — fetch the metrics + chart/series payload.
        const [m, eq, dd, ev, ts] = await Promise.all([
          Api.getMetrics(id),
          Api.getChart(id, "equity"),
          Api.getChart(id, "drawdown"),
          Api.getEquity(id),
          Api.getTrades(id),
        ]);
        if (!active) return;
        setMetrics(m);
        setEquityFig(eq.figure);
        setDrawdownFig(dd.figure);
        setEquityData(ev);
        setTrades(ts);
      } catch (e) {
        if (active) setError(String(e));
      }
    })();

    return () => { active = false; if (pollTimer) clearTimeout(pollTimer); };
  }, [id, preloaded]);

  // ── Initial-load gate ──────────────────────────────────────────────────────
  // The loader replaces the page until the run has finished and all data is in.
  // Progress eases toward ~80% while loading, then snaps to 100% once ready.
  // Mirrors the Configure page so the handoff feels consistent.
  const isReady =
    (metrics !== null && equityFig !== null && drawdownFig !== null &&
     equityData !== null && runInfo !== null) || error !== null;
  const mountRef = useRef(performance.now());
  const [loadProgress, setLoadProgress] = useState(preloaded ? 100 : 0);
  const [loaderDone, setLoaderDone]     = useState(!!preloaded);
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
      // Distinct dash per benchmark so the lines read apart from the solid
      // strategy curve: B&H dashed, S&P 500 dotted. No fill — strategy only.
      const dash = b.kind === "buy_and_hold" ? "5px,5px" : "2px,4px";
      return {
        x: eq.map((p) => p.ts),
        y: eq.map((p) => p.equity),
        mode: "lines",
        name: b.label,
        line: { color: b.hex, width: 1.5, dash },
        hovertemplate: "%{x|%Y-%m-%d}<br>$%{y:,.0f}<extra></extra>",
      };
    });
    if (overlays.length === 0) return equityFig;
    return { ...equityFig, data: [...equityFig.data, ...overlays] };
  }, [equityFig, activeBenchmarks, benchData]);

  // Always show the inline legend over the chart — even strategy-only.
  const chartLegend: ChartLegendItem[] = [
    { label: STRATEGY.label, hex: STRATEGY.hex, tag: STRATEGY.tag, tagClass: STRATEGY.tagClass },
    ...loadedActive.map((b) => ({
      label: b.label, hex: b.hex, tag: b.tag, tagClass: b.tagClass,
    })),
  ];

  const benchState: Record<BenchmarkKind, BenchmarkState> = {
    buy_and_hold: pillState(benchData.buy_and_hold),
    sp500: pillState(benchData.sp500),
  };

  // The S&P 500 benchmark is SPY buy-and-hold, so comparing SPY against itself
  // is meaningless (and the backend never persists it). Hide the pill entirely.
  const hiddenBenchmarks = new Set<BenchmarkKind>();
  if (runInfo?.asset?.toUpperCase() === "SPY") hiddenBenchmarks.add("sp500");

  if (!Number.isFinite(id)) {
    return <div className="m-10 card border-accent-red text-accent-red">Invalid run ID.</div>;
  }

  // ── Loading screen while the Results page data loads ──────────────────────
  if (!loaderDone) {
    return (
      <PipelineLoadingScreen
        title="Loading Results"
        messages={LOADING_MESSAGES}
        progress={loadProgress}
        contextLine={
          runInfo ? (
            <>
              {runInfo.strategyName} &middot; {runInfo.asset} &middot;{" "}
              {runInfo.startDate.slice(0, 4)}&ndash;{runInfo.endDate.slice(0, 4)}
            </>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="px-10 py-8 pb-16 space-y-5">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5 text-[17px] mb-2.5 flex-wrap">
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
                <span className="font-mono text-[15px] text-ink-muted">
                  {runInfo.asset}
                </span>
                <span className="text-border-subtle">&middot;</span>
                <span className="font-mono text-[15px] text-ink-muted">
                  {fmtBacktestDate(runInfo.startDate)} &ndash; {fmtBacktestDate(runInfo.endDate)}
                </span>
                <ConfigPopover run={runInfo} forceClosed={aiModalOpen} />
              </>
            )}
          </div>
          <h2 className="text-ink-primary">Backtest Results</h2>
        </div>

        <div className="flex gap-2.5">
          <button
            className="btn-secondary border-accent-cyan text-accent-cyan hover:bg-accent-cyan/10"
            onClick={() => setAiModalOpen(true)}
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
        exclude={hiddenBenchmarks}
      />

      {error && (
        <div className="card border-accent-red text-accent-red text-sm">{error}</div>
      )}

      {/* ── 10-metric grid (2 rows × 5 cols) ────────────────────── */}
      <MetricsPanel metrics={metrics} benchmarks={metricsBenchmarks} />

      {/* ── Tabbed chart panel ──────────────────────────────────── */}
      <div className="border border-border rounded-lg overflow-hidden">

        {/* Tab bar — tabs on the left, equity legend on the far right. */}
        <div className="flex items-center justify-between border-b border-border px-5 bg-surface">
          <div className="flex items-center">
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

          {activeChart === "equity" && chartLegend.length > 0 && (
            <div className="flex items-center gap-3">
              {chartLegend.map((it) => (
                <div key={it.label} className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${it.tagClass ?? ""}`}
                  >
                    {it.tag ?? it.label}
                  </span>
                  <span className="text-[12px] text-ink-muted">{it.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart body — every tab responds to the active benchmarks. */}
        <div className="bg-surface">
          {activeChart === "equity"         && <EquityCurve      figure={equityFigWithOverlays} />}
          {activeChart === "drawdown"       && <DrawdownChart    figure={drawdownFig}    benchmarks={benchmarkSeries} />}
          {activeChart === "heatmap"        && <MonthlyHeatmap   equityData={equityData} benchmarks={benchmarkSeries} />}
          {activeChart === "trade_pnl"      && <TradePnlChart    trades={trades} showBenchmarkNote={activeBenchmarks.size > 0} />}
          {activeChart === "rolling_sharpe" && <RollingSharpChart equityData={equityData} benchmarks={benchmarkSeries} />}
        </div>
      </div>

      {/* ── Trade log ───────────────────────────────────────────── */}
      <TradeList trades={trades} />

      {/* ── AI Analyst modal ────────────────────────────────────── */}
      <AIAnalystModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        runId={id}
        metrics={metrics}
        runInfo={runInfo}
      />
    </div>
  );
}

