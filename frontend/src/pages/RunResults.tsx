import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Api, type Metrics, type PlotlyFigure, type Trade } from "@/api/client";
import { DrawdownChart } from "@/components/DrawdownChart";
import { EquityCurve } from "@/components/EquityCurve";
import { MetricsPanel } from "@/components/MetricsPanel";
import { MonthlyHeatmap } from "@/components/MonthlyHeatmap";
import { TradeList } from "@/components/TradeList";

/** Run results page: charts + KPIs + trades + (LLM panel in demo mode). */
export function RunResults() {
  const { runId } = useParams();
  const id = Number(runId);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equityFig, setEquityFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [drawdownFig, setDrawdownFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [heatmapFig, setHeatmapFig] = useState<PlotlyFigure["figure"] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [llmText, setLlmText] = useState<string | null>(null);
  const [llmDemoMode, setLlmDemoMode] = useState(false);
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

  const askLLM = async () => {
    try {
      const r = await Api.explain({ op: "answer_question", run_id: id, user_question: "Summarise this run." });
      setLlmText(r.text);
      setLlmDemoMode(r.demo_mode);
    } catch (e) {
      setLlmText(`Error: ${String(e)}`);
    }
  };

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

      {/* LLM panel — demo mode in v1 ----------------------------------- */}
      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2>AI explanation</h2>
          <button className="btn-primary" onClick={askLLM}>
            Explain this run
          </button>
        </div>
        {llmDemoMode && (
          <p className="text-xs text-amber-700">
            LLM is in demo mode (NullProvider). Plug in Google Gemini in a future iteration —
            see <code>backend/llm/gemini_provider.py</code>.
          </p>
        )}
        {llmText && <pre className="whitespace-pre-wrap text-sm text-slate-700">{llmText}</pre>}
      </div>
    </div>
  );
}
