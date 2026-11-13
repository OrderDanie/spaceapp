/*
 * In-browser side of the analyst. The server owns the numbers (so every
 * visitor sees identical, cached measurements); the browser runs the same
 * classifier on the same imagery purely to *draw* what changed.
 */
import {
  ANALYSIS_SIZE,
  CHANGES,
  CLASSES,
  analysisUrl,
  classifyImage,
  darkShare,
  diffLabels,
  gapCheckUrl,
  type Transitions,
} from "@/lib/spectral";

export interface Footprint {
  lat: number;
  lon: number;
  span: number;
}

function loadPixels(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const [w, h] = ANALYSIS_SIZE;
    const img = new Image();
    img.crossOrigin = "anonymous"; // NASA GIBS sends CORS headers, so the canvas stays readable
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas is unavailable");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h).data);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("NASA imagery could not be loaded"));
    img.src = url;
  });
}

const labelCache = new Map<string, Promise<Uint8Array>>();

/** Classify one day of a footprint (memoised for the session). */
export function classifyScene(geo: Footprint, date: string): Promise<Uint8Array> {
  const key = `${geo.lat},${geo.lon},${geo.span}|${date}`;
  let p = labelCache.get(key);
  if (!p) {
    p = (async () => {
      const [w, h] = ANALYSIS_SIZE;
      const data = await loadPixels(analysisUrl(geo.lat, geo.lon, geo.span, date));
      let trueColor: Uint8ClampedArray | null = null;
      if (darkShare(data, w, h) > 0.004) {
        try {
          trueColor = await loadPixels(gapCheckUrl(geo.lat, geo.lon, geo.span, date));
        } catch {
          trueColor = null;
        }
      }
      return classifyImage(data, w, h, { lat: geo.lat, span: geo.span }, trueColor).labels;
    })();
    labelCache.set(key, p);
    p.catch(() => labelCache.delete(key));
  }
  return p;
}

function toDataUrl(paint: (px: Uint8ClampedArray) => void): string {
  const [w, h] = ANALYSIS_SIZE;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  paint(img.data);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export interface ChangeMap {
  /** Transparent PNG: only pixels whose class changed are painted. */
  url: string;
  transitions: Transitions;
  /** Which change kinds actually occur, largest first. */
  legend: { label: string; color: string; km2: number }[];
}

const mapCache = new Map<string, Promise<ChangeMap>>();

/** Pixel-level change map between two days of the same footprint. */
export function changeMap(geo: Footprint, a: string, b: string): Promise<ChangeMap> {
  const key = `${geo.lat},${geo.lon},${geo.span}|${a}|${b}`;
  let p = mapCache.get(key);
  if (!p) {
    p = (async () => {
      const [w, h] = ANALYSIS_SIZE;
      const [la, lb] = await Promise.all([classifyScene(geo, a), classifyScene(geo, b)]);
      const { transitions, change } = diffLabels(la, lb, w, h, { lat: geo.lat, span: geo.span });
      const url = toDataUrl((px) => {
        for (let i = 0; i < change.length; i++) {
          const kind = CHANGES[change[i]];
          if (!kind) continue;
          const o = i * 4;
          px[o] = kind.color[0];
          px[o + 1] = kind.color[1];
          px[o + 2] = kind.color[2];
          px[o + 3] = 215;
        }
      });
      const legend = CHANGES.filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => ({ label: c.label, color: `rgb(${c.color.join(",")})`, km2: transitions[c.key] }))
        .filter((l) => l.km2 > 0)
        .sort((x, y) => y.km2 - x.km2);
      return { url, transitions, legend };
    })();
    mapCache.set(key, p);
    p.catch(() => mapCache.delete(key));
  }
  return p;
}

const classCache = new Map<string, Promise<string>>();

/** Opaque land-cover map for one day — every pixel painted in its class colour. */
export function classMap(geo: Footprint, date: string): Promise<string> {
  const key = `${geo.lat},${geo.lon},${geo.span}|${date}`;
  let p = classCache.get(key);
  if (!p) {
    p = classifyScene(geo, date).then((labels) =>
      toDataUrl((px) => {
        for (let i = 0; i < labels.length; i++) {
          const c = CLASSES[labels[i]].color;
          const o = i * 4;
          px[o] = c[0];
          px[o + 1] = c[1];
          px[o + 2] = c[2];
          px[o + 3] = 255;
        }
      })
    );
    classCache.set(key, p);
    p.catch(() => classCache.delete(key));
  }
  return p;
}
