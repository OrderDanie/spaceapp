import { useApp } from "@/store";
import { useIsLg, useIsSm, useIsXl } from "./useMediaQuery";

export const APP_ICON_MORPH_ID = "app-icon";

/**
 * Shared-element morphs need a *visible* partner. A `layoutId` on an element
 * hidden with `display:none` makes the morph fly in from a 0×0 box at the top
 * left, so these hooks pick the one copy that is actually on screen.
 *
 * Note: framer-motion registers a layoutId on mount only, so callers must
 * re-key the element when its target status changes.
 */
export function useBrandMorphTarget(): "sidebar" | "topbar" | "mobile" | null {
  const lg = useIsLg();
  const sm = useIsSm();
  const open = useApp((s) => s.sidebarOpen);
  if (lg) return open ? "sidebar" : "topbar";
  if (!sm) return "mobile";
  return null;
}

export function useSearchMorphTarget(): "sidebar" | "topbar" | null {
  const lg = useIsLg();
  const xl = useIsXl();
  const open = useApp((s) => s.sidebarOpen);
  if (lg && open) return "sidebar";
  if (xl && !open) return "topbar";
  return null;
}

export const morphLayout = { layout: { type: "spring", stiffness: 260, damping: 30 } } as const;
