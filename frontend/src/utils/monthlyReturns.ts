// Single source of truth for the monthly + annual returns grid. Used by BOTH
// the Results-page heatmap (MonthlyHeatmap.tsx) and the exported HTML report
// (exportReportHtml.ts) so the two can never drift.
//
// Convention (matches the web app, deliberately): a month's return is measured
// WITHIN the month — first bar to last bar of that calendar month — and a
// year's return is the first bar to the last bar of that calendar year. Both
// are expressed as percentages (e.g. 5.0 means +5%). Year/month are taken from
// the local-time calendar (new Date(ts)) so a report generated in a given
// browser matches that browser's live heatmap exactly.

import type { EquityPoint } from "@/api/client";

export interface MonthlyReturns {
  /** Calendar years present, ascending. */
  years: number[];
  /** returns[year][month 1..12] — percentage, or null when no bars that month. */
  returns: Record<number, Record<number, number | null>>;
  /** annual[year] — percentage, or null when fewer than 2 bars that year. */
  annual: Record<number, number | null>;
}

/** Compute the per-year × per-month (and annual) return grid from an equity curve. */
export function computeMonthlyReturns(data: EquityPoint[]): MonthlyReturns {
  const monthly: Record<number, Record<number, { first: number; last: number }>> = {};
  for (const pt of data) {
    const d = new Date(pt.ts);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!monthly[y]) monthly[y] = {};
    if (!monthly[y][m]) {
      monthly[y][m] = { first: pt.equity, last: pt.equity };
    } else {
      monthly[y][m].last = pt.equity;
    }
  }

  const years = Object.keys(monthly).map(Number).sort((a, b) => a - b);

  const annual: Record<number, number | null> = {};
  for (const y of years) {
    const pts = data.filter((pt) => new Date(pt.ts).getFullYear() === y);
    annual[y] =
      pts.length >= 2 ? (pts[pts.length - 1].equity / pts[0].equity - 1) * 100 : null;
  }

  const returns: Record<number, Record<number, number | null>> = {};
  for (const y of years) {
    returns[y] = {};
    for (let m = 1; m <= 12; m++) {
      const cell = monthly[y]?.[m];
      returns[y][m] = cell ? (cell.last / cell.first - 1) * 100 : null;
    }
  }

  return { years, returns, annual };
}
