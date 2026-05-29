// Anonymous per-browser identity. A random id is minted on first visit and
// persisted in localStorage, then sent as the X-Client-Id header on every API
// call so the backend can scope a user's backtests to their browser — no login.
// Clearing site data or switching browser/device starts a fresh, empty dashboard.

const KEY = "qb_client_id";

export function getClientId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
