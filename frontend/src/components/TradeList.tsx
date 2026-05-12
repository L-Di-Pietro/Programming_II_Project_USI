import { useState } from "react";

import type { Trade } from "@/api/client";

const PAGE_SIZE = 12;

type SortKey = keyof Trade | "date";
type SortDir = 1 | -1;

const COLUMNS: { label: string; key: SortKey; right?: boolean }[] = [
  { label: "#",       key: "id"           },
  { label: "Date",    key: "ts"           },
  { label: "Side",    key: "side"         },
  { label: "Qty",     key: "qty",    right: true },
  { label: "Price",   key: "price",  right: true },
  { label: "Comm.",   key: "commission", right: true },
  { label: "Net PnL", key: "net_pnl", right: true },
];

export function TradeList({ trades }: { trades: Trade[] }) {
  const [page, setPage]         = useState(0);
  const [sortKey, setSortKey]   = useState<SortKey>("id");
  const [sortDir, setSortDir]   = useState<SortDir>(1);

  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));

  const sorted = [...trades].sort((a, b) => {
    const av = a[sortKey as keyof Trade];
    const bv = b[sortKey as keyof Trade];
    if (av == null || bv == null) return 0;
    if (typeof av === "string" && typeof bv === "string") return sortDir * av.localeCompare(bv);
    return sortDir * ((av as number) - (bv as number));
  });

  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1) as SortDir);
    else { setSortKey(key); setSortDir(1); }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">

      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          Trade Log
        </span>
        <span className="font-mono text-[11px] text-ink-muted">
          {trades.length} trade{trades.length === 1 ? "" : "s"} &middot; page {page + 1}/{totalPages}
        </span>
      </div>

      {/* Column headers */}
      <div
        className="grid px-5 py-2.5 border-b border-border bg-surface"
        style={{ gridTemplateColumns: "0.5fr 1fr 0.8fr 1fr 1fr 0.9fr 1fr" }}
      >
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => toggleSort(col.key)}
            className={`font-mono text-[10px] uppercase tracking-wider text-left hover:text-ink-primary transition-colors ${
              col.right ? "text-right" : ""
            } ${sortKey === col.key ? "text-accent-cyan" : "text-ink-muted"}`}
          >
            {col.label}
            {sortKey === col.key && (
              <span className="ml-0.5">{sortDir > 0 ? " ↑" : " ↓"}</span>
            )}
          </button>
        ))}
      </div>

      {/* Rows */}
      {slice.length === 0 && (
        <div className="px-5 py-10 text-center text-ink-muted text-sm font-mono">
          No trades.
        </div>
      )}

      {slice.map((t) => {
        const isWin = t.net_pnl > 0;
        return (
          <div
            key={t.id}
            className="grid px-5 py-2.5 border-b border-border hover:bg-white/[0.02] transition-colors"
            style={{
              gridTemplateColumns: "0.5fr 1fr 0.8fr 1fr 1fr 0.9fr 1fr",
              borderLeft: `2px solid ${isWin ? "rgba(63,185,80,0.35)" : "rgba(248,81,73,0.35)"}`,
            }}
          >
            <span className="font-mono text-[12px] text-ink-muted">{t.id}</span>
            <span className="font-mono text-[12px] text-ink-muted">
              {new Date(t.ts).toISOString().slice(0, 10)}
            </span>
            <span className={`font-mono text-[12px] font-bold ${t.side === "buy" ? "text-accent-green" : "text-accent-red"}`}>
              {t.side.toUpperCase()}
            </span>
            <span className="font-mono text-[12px] text-ink-primary text-right">{t.qty.toFixed(4)}</span>
            <span className="font-mono text-[12px] text-ink-primary text-right">${t.price.toFixed(2)}</span>
            <span className="font-mono text-[12px] text-ink-muted text-right">${t.commission.toFixed(2)}</span>
            <span className={`font-mono text-[12px] font-bold text-right ${isWin ? "text-accent-green" : "text-accent-red"}`}>
              {t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}
            </span>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-6 px-5 py-3.5">
          <button
            className="btn-ghost text-xs font-mono"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            &lt; Prev
          </button>
          <span className="font-mono text-[12px] text-ink-muted">
            {page + 1} / {totalPages}
          </span>
          <button
            className="btn-ghost text-xs font-mono"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next &gt;
          </button>
        </div>
      )}
    </div>
  );
}
