import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const OVERLAY_ROOT_ID = "epoch-overlay-root";

/**
 * Renders modal content into the app's overlay layer, which sits above pages
 * but below the Dynamic Island and Spotlight — so feedback stays visible.
 * Falls back to <body> if the layer isn't mounted yet.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(OVERLAY_ROOT_ID)
  );
  useEffect(() => {
    if (!target) setTarget(document.getElementById(OVERLAY_ROOT_ID) ?? document.body);
  }, [target]);
  return target ? createPortal(children, target) : null;
}
