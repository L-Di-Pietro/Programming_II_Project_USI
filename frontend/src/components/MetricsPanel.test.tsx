import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { Metrics } from "@/api/client";
import { MetricsPanel } from "./MetricsPanel";

afterEach(cleanup);

const strategy: Metrics = {
  return: { cagr_pct: 24.35, total_return_pct: 50 },
  risk: { max_drawdown_pct: -10, sharpe_ratio: 1.5, sortino_ratio: 2, calmar_ratio: 1 },
  trade: { win_rate_pct: 60, profit_factor: 2, total_trades: 20 },
};

const buyHold: Metrics = {
  return: { cagr_pct: 11.42, total_return_pct: 20 },
  risk: { max_drawdown_pct: -8, sharpe_ratio: 0.9, sortino_ratio: 1.2, calmar_ratio: 0.7 },
  trade: { win_rate_pct: 0, profit_factor: 0, total_trades: 0 },
};

const bhSeries = {
  kind: "buy_and_hold",
  tag: "B&H",
  tagClass: "text-accent-blue",
  metrics: buyHold,
};

describe("MetricsPanel", () => {
  it("renders a single strategy value with no identifier tags when no benchmarks", () => {
    render(<MetricsPanel metrics={strategy} />);
    expect(screen.getByText("+24.35%")).toBeTruthy();
    expect(screen.queryByText("STR")).toBeNull();
    expect(screen.queryByText("B&H")).toBeNull();
  });

  it("stacks benchmark values with identifier tags, keeping the 22px value size", () => {
    render(<MetricsPanel metrics={strategy} benchmarks={[bhSeries]} />);
    const strategyCagr = screen.getByText("+24.35%");
    const benchmarkCagr = screen.getByText("+11.42%");
    expect(strategyCagr.className).toContain("text-[22px]");
    expect(benchmarkCagr.className).toContain("text-[22px]");
    expect(screen.getAllByText("STR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B&H").length).toBeGreaterThan(0);
  });

  it("shows an em-dash for trade-only metrics on benchmark rows", () => {
    render(<MetricsPanel metrics={strategy} benchmarks={[bhSeries]} />);
    // Strategy keeps its real win rate; the benchmark's trade-only cells blank.
    expect(screen.getByText("+60.00%")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
