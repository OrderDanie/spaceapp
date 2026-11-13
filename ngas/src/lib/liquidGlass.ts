/*
 * Liquid glass that actually bends light.
 *
 * A frosted panel only blurs and tints what is behind it. Real glass also
 * refracts: towards its rounded edge the surface curves, so the picture behind
 * is pulled inward and folds over on itself along the rim. This module gives
 * every `.glass` / `.glass-strong` surface that edge.
 *
 * How: for each surface size it draws a displacement map — a picture whose
 * red and green channels say "sample the backdrop this many pixels to the
 * left/right and up/down" — shaped like the bevel of a rounded slab, and
 * builds an SVG filter with two layers:
 *   · the rim: the *sharp* backdrop pushed through <feDisplacementMap>;
 *   · the face, laid over it: the backdrop softly blurred (how much comes
 *     from the surface's own `--g-blur`, so CSS stays in charge of the
 *     material), stopping short of the edge and feathered so the rim shows
 *     through around it.
 * A blur over the whole surface would smear the bend away — which is exactly
 * why frosted glass never looks like glass. The surface's CSS then runs
 * `backdrop-filter: url(#that-filter) saturate(…)`.
 *
 * Browser support is the catch: only Chromium (Chrome, Edge, Brave, Arc,
 * Android Chrome) accepts an SVG filter inside backdrop-filter. Safari and
 * Firefox ignore it, so there the surfaces keep the blur, tint and lit rim
 * but do not bend. `refractionSupported` says which case this is.
 */

const NS = "http://www.w3.org/2000/svg";
const SELECTOR = ".glass, .glass-strong";
/** Surfaces larger than this (a full-screen sheet on a big display) stay un-bent to protect frame rate. */
const MAX_AREA = 620_000;
const MIN_SIDE = 14;

export const refractionSupported = (() => {
  if (typeof window === "undefined" || typeof CSS === "undefined" || typeof ResizeObserver === "undefined") return false;
  const ua = navigator.userAgent;
  // "Chrome/" appears in every Chromium desktop/Android browser; iOS browsers (CriOS, FxiOS…) are WebKit and do not match.
  const chromium = /Chrom(e|ium)\/\d/.test(ua) && !/Edge\/\d/.test(ua);
  return chromium && CSS.supports("backdrop-filter", "url(#a) blur(1px)");
})();

interface Entry {
  key: string;
  refs: number;
  node: SVGFilterElement;
}

let defs: SVGDefsElement | null = null;
let enabled = true;
let started = false;
const filters = new Map<string, Entry>();
const applied = new WeakMap<Element, string>();
const tracked = new Set<HTMLElement>();
let ro: ResizeObserver | null = null;
const pending = new Set<HTMLElement>();
let scheduled = false;

/**
 * The bevel of a rounded slab, as a displacement map.
 * Inside the bevel band each pixel is told to sample the backdrop further
 * towards the centre; the pull is strongest right at the rim and eases to
 * nothing where the bevel meets the flat face. Mid-grey (128) means "no shift".
 */
function bevelMap(w: number, h: number, r: number, bevel: number): string {
  // Big surfaces are drawn at half size and stretched — the map is smooth, so nothing is lost.
  const s = w * h > 90_000 ? 0.5 : 1;
  const cw = Math.max(2, Math.round(w * s));
  const ch = Math.max(2, Math.round(h * s));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(cw, ch);
  const d = img.data;
  const hx = w / 2;
  const hy = h / 2;
  for (let y = 0; y < ch; y++) {
    const py = (y + 0.5) / s - hy;
    for (let x = 0; x < cw; x++) {
      const px = (x + 0.5) / s - hx;
      const o = (y * cw + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 128;
      d[o + 3] = 255;
      // Signed distance to the rounded rectangle (negative inside).
      const qx = Math.abs(px) - (hx - r);
      const qy = Math.abs(py) - (hy - r);
      const ax = Math.max(qx, 0);
      const ay = Math.max(qy, 0);
      const corner = Math.hypot(ax, ay);
      const depth = -(corner + Math.min(Math.max(qx, qy), 0) - r); // how far inside the edge
      if (depth <= 0 || depth >= bevel) continue;
      // Outward normal of the edge nearest this pixel.
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        nx = (ax / corner) * Math.sign(px);
        ny = (ay / corner) * Math.sign(py);
      } else if (qx > qy) nx = Math.sign(px);
      else ny = Math.sign(py);
      const t = depth / bevel;
      // Cubic: a hard pull right at the edge (the backdrop folds over and squeezes, as it does in
      // thick glass) that dies away quickly, so the stretched zone between is only a few pixels wide.
      const pull = (1 - t) * (1 - t) * (1 - t);
      d[o] = Math.round(128 - nx * pull * 127);
      d[o + 1] = Math.round(128 - ny * pull * 127);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function ensureDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  defs = document.createElementNS(NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const keyFor = (w: number, h: number, r: number, face: number) => `lg-${w}x${h}r${r}f${Math.round(face * 10)}`;

function acquire(w: number, h: number, r: number, face: number): string | null {
  const key = keyFor(w, h, r, face);
  let e = filters.get(key);
  if (!e) {
    // The bevel is as wide as the corner allows, within sensible limits.
    const bevel = Math.max(5, Math.min(26, r, Math.min(w, h) * 0.36));
    const map = bevelMap(w, h, r, bevel);
    if (!map) return null;
    // sRGB: without it the map's values would be gamma-converted and every pixel would drift.
    const f = svg("filter", { id: key, x: 0, y: 0, width: "100%", height: "100%", "color-interpolation-filters": "sRGB" });
    // Strongest pull, at the very edge: one bevel-width (the map stores ±half of `scale`).
    const scale = Math.round(Math.min(bevel, Math.min(w, h) * 0.45) * 2);
    /*
     * Bending is the costly step and only the rim needs it, so on large
     * surfaces it is confined to four strips along the edges (filter
     * primitives accept a sub-region). Each strip is exactly one bevel wide:
     * at its inner edge the pull has reached zero, so it meets the untouched
     * backdrop without a seam.
     */
    const band = Math.ceil(bevel);
    const strips =
      w * h > 40_000 && w > band * 3 && h > band * 3
        ? [
            { x: 0, y: 0, width: w, height: band },
            { x: 0, y: h - band, width: w, height: band },
            { x: 0, y: band, width: band, height: h - band * 2 },
            { x: w - band, y: band, width: band, height: h - band * 2 },
          ]
        : [{ x: 0, y: 0, width: w, height: h }];
    f.append(
      svg("feImage", { x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", href: map, result: "bevel" }),
      // What the rim bends is taken very slightly out of focus: squeezed text and fine
      // detail would otherwise turn into a noisy fringe; this keeps it a smooth fold.
      svg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: Math.max(1.2, Math.min(2.4, face * 0.26)), result: "soft" })
    );
    const merge = svg("feMerge", {});
    strips.forEach((strip, i) => {
      // The rim: the sharp backdrop, bent.
      f.appendChild(svg("feDisplacementMap", { ...strip, in: "soft", in2: "bevel", scale, xChannelSelector: "R", yChannelSelector: "G", result: `rim${i}` }));
      merge.appendChild(svg("feMergeNode", { in: `rim${i}` }));
    });
    /*
     * The face goes on top: the blurred backdrop, cut off a little way in
     * from the edge and then feathered. The feathering is what lets the rim
     * show through around it — and it lands on the narrow zone where the bend
     * is merely a stretch, so only the crisp folded edge stays visible.
     * (Masking the rim with a second picture looks the same but cost about a
     * third of the frame rate; two blurs cost almost nothing.)
     */
    const inset = Math.round(bevel * 0.52);
    const feather = Math.max(2, Math.min(4, bevel * 0.16));
    f.append(
      svg("feGaussianBlur", { in: "SourceGraphic", stdDeviation: face, x: inset, y: inset, width: w - inset * 2, height: h - inset * 2, result: "core" }),
      svg("feGaussianBlur", { in: "core", stdDeviation: feather, result: "face" })
    );
    merge.appendChild(svg("feMergeNode", { in: "face" }));
    f.appendChild(merge);
    ensureDefs().appendChild(f);
    e = { key, refs: 0, node: f };
    filters.set(key, e);
  }
  e.refs++;
  return key;
}

function release(key: string | undefined) {
  if (!key) return;
  const e = filters.get(key);
  if (!e) return;
  e.refs--;
  if (e.refs > 0) return;
  // Keep it a moment — surfaces often unmount and remount at the same size.
  window.setTimeout(() => {
    if (e.refs <= 0 && filters.get(key) === e) {
      e.node.remove();
      filters.delete(key);
    }
  }, 4000);
}

function clear(el: HTMLElement) {
  const key = applied.get(el);
  if (!key) return;
  applied.delete(el);
  el.style.removeProperty("--lg-bend");
  release(key);
}

function fit(el: HTMLElement) {
  if (!el.isConnected) {
    clear(el);
    tracked.delete(el);
    ro?.unobserve(el);
    return;
  }
  const w = Math.round(el.offsetWidth);
  const h = Math.round(el.offsetHeight);
  if (!enabled || w < MIN_SIDE || h < MIN_SIDE || w * h > MAX_AREA) return clear(el);
  const cs = getComputedStyle(el);
  const r = Math.round(Math.max(0, Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2)));
  // How frosted the face is belongs to the material (CSS): clear chrome is light, reading surfaces dense.
  const face = Math.max(0, Math.min(40, parseFloat(cs.getPropertyValue("--g-blur")) || 6));
  const key = keyFor(w, h, r, face);
  if (applied.get(el) === key) return;
  const next = acquire(w, h, r, face);
  const prev = applied.get(el);
  if (!next) return clear(el);
  applied.set(el, next);
  el.style.setProperty("--lg-bend", `url(#${next})`);
  release(prev);
}

function flush() {
  scheduled = false;
  const batch = [...pending];
  pending.clear();
  for (const el of batch) fit(el);
}

function queue(el: HTMLElement) {
  pending.add(el);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flush);
}

function adopt(root: ParentNode | Element) {
  const found: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SELECTOR)) found.push(root);
  root.querySelectorAll?.<HTMLElement>(SELECTOR).forEach((el) => found.push(el));
  for (const el of found) {
    if (tracked.has(el)) continue;
    tracked.add(el);
    ro?.observe(el); // fires once immediately, and again whenever the surface changes size
  }
}

function drop(root: Node) {
  if (!(root instanceof HTMLElement)) return;
  const gone: HTMLElement[] = [];
  if (root.matches(SELECTOR)) gone.push(root);
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => gone.push(el));
  for (const el of gone) queue(el); // `fit` notices it is disconnected and lets go
}

/** Start bending every glass surface, now and as the app mounts new ones. */
export function initLiquidGlass() {
  if (started || typeof document === "undefined") return;
  started = true;
  document.documentElement.classList.toggle("no-refraction", !refractionSupported);
  if (!refractionSupported) return;
  ro = new ResizeObserver((entries) => {
    for (const e of entries) queue(e.target as HTMLElement);
  });
  new MutationObserver((records) => {
    for (const rec of records) {
      rec.addedNodes.forEach((n) => n instanceof Element && adopt(n));
      rec.removedNodes.forEach(drop);
    }
  }).observe(document.body, { childList: true, subtree: true });
  adopt(document.body);
}

/** Settings switch: turn the bending on or off live (the frosted look remains either way). */
export function setRefraction(on: boolean) {
  enabled = on;
  // Without the bend, surfaces fall back to a denser frost (see `.no-refraction` in index.css).
  document.documentElement.classList.toggle("no-refraction", !on || !refractionSupported);
  if (!refractionSupported || !started) return;
  for (const el of tracked) queue(el);
}

/* ---------------------------- light on the rim ---------------------------- */
/**
 * The bright edge of a glass surface leans towards the pointer, the way a
 * highlight slides around a real bevel as you move. Only the 1px rim is
 * affected; nothing is drawn over the content.
 */
export function initRimLight() {
  if (typeof window === "undefined") return;
  let lit: HTMLElement | null = null;
  let frame = 0;
  let last: PointerEvent | null = null;
  const paint = () => {
    frame = 0;
    const e = last;
    if (!e) return;
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".liquid") : null;
    if (lit && lit !== el) {
      lit.style.removeProperty("--lx");
      lit.style.removeProperty("--ly");
    }
    lit = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--lx", `${Math.round(e.clientX - r.left)}px`);
    el.style.setProperty("--ly", `${Math.round(e.clientY - r.top)}px`);
  };
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true }
  );
}
