import type { ReactNode } from "react";

/**
 * Horizontally-scrollable wrapper with a right-edge gradient fade that hints the
 * content scrolls. The fade only shows below `md` (phones), where wide tables /
 * heatmaps overflow; at md+ they fit, so no hint is drawn.
 */
export function ScrollHint({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative">
      <div className={`overflow-x-auto ${className}`}>{children}</div>
      <div className="pointer-events-none absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-base to-transparent md:hidden" />
    </div>
  );
}
