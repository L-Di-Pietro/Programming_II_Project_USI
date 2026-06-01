// Lightweight helper (no heavy imports) so callers can open the report tab
// synchronously inside a click handler — BEFORE the heavy exportReportHtml
// chunk is dynamically imported. A post-`await` window.open() forfeits the user
// gesture and trips the popup blocker, so we open the blank tab first and
// navigate it to the built report once ready.

const LOADING_HTML =
  `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Generating report…</title>` +
  `<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;` +
  `background:#e8e7e2;color:#475569;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}` +
  `.box{display:flex;flex-direction:column;align-items:center;gap:16px}` +
  `.sp{width:34px;height:34px;border-radius:50%;border:3px solid #cbd5e1;border-top-color:#0891b2;` +
  `animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head>` +
  `<body><div class="box"><div class="sp"></div><div>Generating report…</div></div></body></html>`;

/**
 * Open a blank tab showing a loading placeholder. Call synchronously in the
 * click handler; pass the returned window to `openReportHtml(runId, report, win)`
 * once the report has been built. Returns null if the popup was blocked.
 */
export function openReportTab(): Window | null {
  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(LOADING_HTML);
    win.document.close();
  }
  return win;
}
