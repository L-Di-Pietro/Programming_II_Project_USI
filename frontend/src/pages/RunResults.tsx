import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Api, type Metrics, type PlotlyFigure, type Trade } from "@/api/client";
import { DrawdownChart } from "@/components/DrawdownChart";
import { EquityCurve } from "@/components/EquityCurve";
import { MetricsPanel } from "@/components/MetricsPanel";
import { MonthlyHeatmap } from "@/components/MonthlyHeatmap";
import { ReportCard } from "@/components/ReportCard";
import { TradeList } from "@/components/TradeList";

/** Run results page: charts + KPIs + trades + AI report. */
export function RunResults() {
  const { runId } = useParams();
  const id = Number(runId);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equityFig, setEquityFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [drawdownFig, setDrawdownFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [heatmapFig, setHeatmapFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let active = true;
    Promise.all([
      Api.getMetrics(id),
      Api.getChart(id, "equity"),
      Api.getChart(id, "drawdown"),
      Api.getChart(id, "heatmap"),
      Api.getTrades(id),
    ])
      .then(([m, eq, dd, hm, ts]) => {
        if (!active) return;
        setMetrics(m);
        setEquityFig(eq.figure);
        setDrawdownFig(dd.figure);
        setHeatmapFig(hm.figure);
        setTrades(ts);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!Number.isFinite(id)) {
    return <div className="card text-accent-red">Invalid run id.</div>;
  }

  return (
    <div className="space-y-6">
      <h1>Run #{id}</h1>
      {error && <div className="card text-accent-red text-sm">{error}</div>}

      <MetricsPanel metrics={metrics} />

      <div className="grid lg:grid-cols-2 gap-4">
        <EquityCurve figure={equityFig} />
        <DrawdownChart figure={drawdownFig} />
      </div>
      <MonthlyHeatmap figure={heatmapFig} />

      <TradeList trades={trades} />

      <ReportCard runId={id} />
    </div>
  );
}
