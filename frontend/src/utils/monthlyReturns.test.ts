import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/api/client";
import { computeMonthlyReturns } from "./monthlyReturns";

function pt(ts: string, equity: number): EquityPoint {
  return { ts, equity, cash: 0, position_value: 0, drawdown_pct: 0 };
}

// Mid-month timestamps at midday UTC so the local-calendar month is unambiguous
// in any timezone the test runner happens to use.
const EQUITY: EquityPoint[] = [
  pt("2020-01-10T12:00:00Z", 100), // Jan first
  pt("2020-01-20T12:00:00Z", 110), // Jan last   → +10%
  pt("2020-02-10T12:00:00Z", 110), // Feb first
  pt("2020-02-20T12:00:00Z", 99), // Feb last    → -10%
  pt("2021-03-10T12:00:00Z", 200), // 2021 only has one month
  pt("2021-03-20T12:00:00Z", 220), // Mar 2021    → +10%
];

describe("computeMonthlyReturns", () => {
  it("computes within-month returns (first→last bar of the month) as percentages", () => {
    const { returns } = computeMonthlyReturns(EQUITY);
    expect(returns[2020][1]).toBeCloseTo(10, 6); // Jan: 100 → 110
    expect(returns[2020][2]).toBeCloseTo(-10, 6); // Feb: 110 → 99
    expect(returns[2021][3]).toBeCloseTo(10, 6); // Mar 2021: 200 → 220
  });

  it("computes annual returns from the year's first→last bar", () => {
    const { annual } = computeMonthlyReturns(EQUITY);
    expect(annual[2020]).toBeCloseTo(-1, 6); // 100 → 99 across the year
    expect(annual[2021]).toBeCloseTo(10, 6); // 200 → 220
  });

  it("returns null for months with no bars and orders years ascending", () => {
    const { years, returns } = computeMonthlyReturns(EQUITY);
    expect(years).toEqual([2020, 2021]);
    expect(returns[2020][3]).toBeNull(); // no March 2020 bars
    expect(returns[2020][12]).toBeNull();
  });

  it("yields a null annual return when a year has fewer than two bars", () => {
    const { annual } = computeMonthlyReturns([pt("2022-06-15T12:00:00Z", 100)]);
    expect(annual[2022]).toBeNull();
  });

  it("handles an empty series without throwing", () => {
    expect(computeMonthlyReturns([])).toEqual({ years: [], returns: {}, annual: {} });
  });
});
