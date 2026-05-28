// Helpers for rendering backend timestamps in the user's local timezone.
// The backend serializes datetimes as ISO 8601 with a trailing "Z", so
// `new Date(iso)` parses them as UTC and Date methods convert to the host's
// local timezone automatically.

export function formatLocal(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
