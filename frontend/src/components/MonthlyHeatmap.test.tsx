import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { EquityPoint } from "@/api/client";
import type { BenchmarkSeries } from "./benchmarks";
import { MonthlyHeatmap } from "./MonthlyHeatmap";

afterEach(cleanup);

function mkEquity(start: number): EquityPoint[] {
  const days = ["2024-01-05", "2024-01-25", "2024-02-05", "2024-02-25", "2024-03-05", "2024-03-25"];
  return days.map((d, i) => ({
    ts: `${d}T00:00:00`,
    equity: start * (1 + i * 0.02),
    cash: 0,
    position_value: 0,
    drawdown_pct: 0,
  }));
}

const strategy = mkEquity(10_000);
const bh: BenchmarkSeries = {
  kind: "buy_and_hold",
  tag: "B&H",
  label: "Buy & Hold",
  hex: "#3B82F6",
  tagClass: "text-accent-blue border-accent-blue/40 bg-accent-blue/[0.08]",
  equity: mkEquity(20_000),
};

describe("MonthlyHeatmap", () => {
  it("renders a single table with no series pills when no benchmarks are active", () => {
    render(<MonthlyHeatmap equityData={strategy} />);
    expect(screen.getByText("Jan")).toBeTruthy();
    expect(screen.getByText("Dec")).toBeTruthy();
    expect(screen.queryByText("STR")).toBeNull();
    expect(screen.queryByText("B&H")).toBeNull();
  });

  it("stacks one labeled box per series when benchmarks are active", () => {
    render(<MonthlyHeatmap equityData={strategy} benchmarks={[bh]} />);
    expect(screen.getAllByText("STR").length).toBeGreaterThan(0);
    expect(screen.getByText("Strategy")).toBeTruthy();
    expect(screen.getAllByText("B&H").length).toBeGreaterThan(0);
    expect(screen.getByText("Buy & Hold")).toBeTruthy();
    // Two boxes ⇒ two month-grids ⇒ "Jan" header appears twice.
    expect(screen.getAllByText("Jan").length).toBe(2);
  });
});
