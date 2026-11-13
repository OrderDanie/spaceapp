/*
 * Touch feedback. Android browsers expose the Vibration API. iOS Safari does
 * not, but (17.4+) plays the system switch haptic when a native
 * <input type="checkbox" switch> toggles — so a hidden one is flipped instead.
 * Where neither exists this is a silent no-op; nothing depends on it.
 */

let enabled = true;
let iosSwitch: HTMLLabelElement | null = null;
let last = 0;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

function iosTick() {
  if (typeof document === "undefined") return;
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

const PATTERNS = {
  light: 8,
  medium: 14,
  success: [10, 40, 16],
  warning: [18, 60, 18],
} as const;

export function haptic(kind: keyof typeof PATTERNS = "light") {
  if (!enabled || typeof navigator === "undefined") return;
  const now = performance.now();
  if (kind === "light" && now - last < 40) return;
  last = now;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[kind] as number | number[]);
      return;
    }
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) iosTick();
  } catch {
    /* unsupported — fine */
  }
}
