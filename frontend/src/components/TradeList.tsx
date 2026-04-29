import { useState } from "react";

import type { Trade } from "@/api/client";

const PAGE_SIZE = 25;

/** Paginated trade ledger. Cheap-and-cheerful pagination — no virtualization. */
export function TradeList({ trades }: { trades: Trade[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const slice = trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3>Trade ledger</h3>
        <div className="text-xs text-slate-500">
          {trades.length} trade{trades.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Side</th>
              <th className="py-2 pr-4 text-right">Qty</th>
              <th className="py-2 pr-4 text-right">Price</th>
              <th className="py-2 pr-4 text-right">Comm.</th>
              <th className="py-2 pr-4 text-right">Net PnL</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-4 font-mono text-xs">
                  {new Date(t.ts).toISOString().slice(0, 10)}
                </td>
                <td className={`py-1.5 pr-4 ${t.side === "buy" ? "text-accent-green" : "text-accent-red"}`}>
                  {t.side.toUpperCase()}
                </td>
                <td className="py-1.5 pr-4 text-right">{t.qty.toFixed(4)}</td>
                <td className="py-1.5 pr-4 text-right">${t.price.toFixed(2)}</td>
                <td className="py-1.5 pr-4 text-right text-slate-500">${t.commission.toFixed(2)}</td>
                <td
                  className={`py-1.5 pr-4 text-right font-medium ${
                    t.net_pnl > 0 ? "text-accent-green" : t.net_pnl < 0 ? "text-accent-red" : ""
                  }`}
                >
                  {t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400 text-sm">
                  No trades.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <div>
            Page {page + 1} / {totalPages}
          </div>
          <button
            className="btn-ghost"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
