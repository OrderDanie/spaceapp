import { useApp } from "@/store";

/**
 * True when a page-level shortcut (Space, arrows…) must not fire: the user is
 * typing, a modal surface is open, or focus is on a control that already uses
 * that key (sliders, the time dial, buttons for Space).
 */
export function pageShortcutBlocked(e: KeyboardEvent) {
  const s = useApp.getState();
  if (s.paletteOpen || s.settingsOpen || !s.welcomeSeen) return true;
  if (document.querySelector("[data-epoch-modal]")) return true;
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  if (t.getAttribute("role") === "slider") return true;
  // Space on a focused button should press that button, not toggle playback.
  if (e.code === "Space" && (t.tagName === "BUTTON" || t.getAttribute("role") === "button" || t.tagName === "A")) return true;
  return false;
}

const APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
/** The modifier key as this device labels it. */
export const MOD = APPLE ? "⌘" : "Ctrl";
/** A shortcut hint, e.g. "⌘K" or "Ctrl K". */
export const shortcut = (key: string) => (APPLE ? `⌘${key}` : `Ctrl ${key}`);
