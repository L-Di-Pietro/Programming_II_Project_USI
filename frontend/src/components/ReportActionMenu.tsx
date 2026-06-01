import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ReportMenuAction {
  key: string;
  label: string;
  /** One-line description shown under the label. */
  hint: string;
  icon: ReactNode;
  onSelect: () => void;
}

const MENU_W = 232; // keep in sync with the width style below
const MARGIN = 8; // min gap from the viewport edge
const GAP = 6; // gap between trigger and menu

/**
 * Smart placement: prefer opening down-and-right from the trigger, flip left
 * when the menu would overflow the right edge and up when it would overflow the
 * bottom. Portaled to <body> so the table's horizontal overflow can't clip it.
 */
function place(anchor: DOMRect, menuH: number): { top: number; left: number } {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  let left = anchor.right - MENU_W; // right-align the menu to the trigger
  if (left < MARGIN) left = anchor.left;
  left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));

  let top = anchor.bottom + GAP;
  if (top + menuH > vh - MARGIN) {
    const above = anchor.top - GAP - menuH;
    top = above >= MARGIN ? above : Math.max(MARGIN, vh - menuH - MARGIN);
  }
  return { top, left };
}

/**
 * Compact action menu for the Dashboard "AI Report" column. A single trigger
 * button expands a small popover of labelled actions; clicking outside or
 * pressing Esc closes it without acting.
 */
export function ReportActionMenu({
  actions,
  title = "Report actions",
}: {
  actions: ReportMenuAction[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const reposition = () => {
      const anchor = btnRef.current?.getBoundingClientRect();
      if (anchor) setCoords(place(anchor, popRef.current?.offsetHeight ?? 0));
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
        aria-label={title}
        className="btn-ghost text-xs px-2 inline-flex items-center gap-0.5"
      >
        <IconDownload />
        <IconChevron />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              width: MENU_W,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[60] bg-surface border border-border rounded-lg shadow-xl p-1.5 text-left cursor-default"
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md
                           text-left hover:bg-white/[0.05] transition-colors"
              >
                <span className="text-accent-cyan mt-[1px] shrink-0">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-ink-primary font-medium leading-tight">
                    {a.label}
                  </span>
                  <span className="block text-[11px] text-ink-muted leading-tight mt-0.5">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
