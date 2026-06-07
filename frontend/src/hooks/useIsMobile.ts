import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * `true` when the viewport is below the desktop breakpoint (`lg`, 1024px) — the
 * point where the app swaps its sidebar for the hamburger drawer. Mirrors the
 * single breakpoint source already used in {@link MobileNav}.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window.matchMedia === "function" ? !window.matchMedia(DESKTOP_QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(!e.matches);
    setIsMobile(!mq.matches); // sync in case the width changed before mount
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
