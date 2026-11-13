/*
 * Pole and gap filling for the globe.
 *
 * NASA's daily mosaics are opaque JPEGs: wherever the satellite saw nothing
 * (the pole in polar night, the wedges between orbits) the tile is solid
 * black, which reads as the planet being cut off. This registers a tile
 * protocol that makes exactly those no-data pixels transparent, so a
 * complete, static base map (NASA Blue Marble) shows through underneath.
 *
 * True-colour layers are masked by their own black pixels. In the infrared
 * composites black is also what open water looks like, so those are masked
 * using the matching true-colour tile instead — the same test the analyst
 * uses to tell a swath gap from the sea.
 */
import maplibregl from "maplibre-gl";
import type { ImageryLayer } from "@/lib/gibs";
import { TRUE_COLOR_LAYER } from "@/lib/spectral";

const SCHEME = "epochfill";
const HOSTS = ["gibs-a", "gibs-b", "gibs-c"];
/** Brightness (r+g+b) below which a pixel is "nothing was imaged here". */
const GAP_LO = 9;
/** …feathered up to here, so JPEG ringing along a gap's edge fades out. */
const GAP_HI = 30;

/** Complete world, no dates, no gaps — only ever seen where the daily image has none. */
export const BASE_TILES = HOSTS.map(
  (h) => `https://${h}.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`
);
export const BASE_MAXZOOM = 8;

export interface PolarFill {
  pole: "north" | "south";
  date: string;
  /** [west, south, east, north] — tiles outside are never requested. */
  bounds: [number, number, number, number];
}

/**
 * Real imagery for the pole that is in darkness.
 *
 * During polar night the daily mosaic has nothing above ~66°. Rather than
 * leave a hole (or patch it with a summer base map that looks nothing like
 * its surroundings), show the same sensor's image from the last date that
 * pole was fully sunlit: 12 April for the Arctic, 10 February for Antarctica.
 * Wherever today's image has data it simply covers this.
 */
export function polarFills(layer: ImageryLayer, date: string): PolarFill[] {
  const lastOn = (md: string) => {
    const y = Number(date.slice(0, 4));
    return `${y}-${md}` <= date ? `${y}-${md}` : `${y - 1}-${md}`;
  };
  const fills: PolarFill[] = [
    { pole: "north", date: lastOn("04-12"), bounds: [-180, 52, 180, 85.0511] },
    { pole: "south", date: lastOn("02-10"), bounds: [-180, -85.0511, 180, -52] },
  ];
  return fills.filter((f) => f.date >= layer.minDate && f.date !== date);
}

/** Daily tiles routed through the gap filter. */
export function filledTileUrls(layer: ImageryLayer, date: string) {
  const selfMasked = layer.id === "viirs" || layer.id === "truecolor";
  return HOSTS.map(
    (h) =>
      `${SCHEME}://${h}.earthdata.nasa.gov/wmts/epsg3857/best/${layer.gibs}/default/${date}/${layer.matrix}/{z}/{y}/{x}.${layer.ext}` +
      (selfMasked ? "" : `?ref=${layer.gibs}`)
  );
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
let scratch: Ctx2D | null = null;

function context(): Ctx2D | null {
  if (scratch) return scratch;
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
  scratch = canvas.getContext("2d", { willReadFrequently: true }) as Ctx2D | null;
  return scratch;
}

function pixels(bitmap: ImageBitmap): ImageData | null {
  const ctx = context();
  if (!ctx) return null;
  ctx.clearRect(0, 0, 256, 256);
  ctx.drawImage(bitmap, 0, 0, 256, 256);
  return ctx.getImageData(0, 0, 256, 256);
}

async function load(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(url, { signal, mode: "cors" });
  if (!res.ok) throw new Error(`Tile ${res.status}`);
  return createImageBitmap(await res.blob());
}

const alphaFor = (sum: number) => (sum <= GAP_LO ? 0 : sum >= GAP_HI ? 255 : Math.round(((sum - GAP_LO) / (GAP_HI - GAP_LO)) * 255));

const N = 256;
const FEATHER = 7;

/**
 * Soften the edge of every gap. The mosaics end abruptly (bright cloud, then
 * nothing), which draws a hard line across the planet. Blurring the alpha
 * mask and keeping the smaller value fades the daily image out over a few
 * pixels instead, without ever making a no-data pixel opaque.
 */
function feather(d: Uint8ClampedArray) {
  const a = new Float32Array(N * N);
  const t = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3];
  const pass = (src: Float32Array, dst: Float32Array, step: number, line: number) => {
    // Sliding-window box blur along rows (step 1) or columns (step N), edges clamped.
    for (let l = 0; l < N; l++) {
      const base = l * line;
      let sum = 0;
      for (let k = -FEATHER; k <= FEATHER; k++) sum += src[base + Math.min(N - 1, Math.max(0, k)) * step];
      for (let i = 0; i < N; i++) {
        dst[base + i * step] = sum / (FEATHER * 2 + 1);
        sum += src[base + Math.min(N - 1, i + FEATHER + 1) * step] - src[base + Math.max(0, i - FEATHER) * step];
      }
    }
  };
  pass(a, t, 1, N);
  pass(t, a, N, 1);
  for (let i = 0; i < N * N; i++) {
    const o = i * 4 + 3;
    // Remap so the fade completes inside the imaged side: 50% blur → fully clear.
    const soft = Math.max(0, Math.min(255, (a[i] - 127.5) * 2));
    if (soft < d[o]) d[o] = soft;
  }
}

/**
 * A Mercator map stops at 85°. The globe covers the last 5° to the pole by
 * stretching the outermost row of pixels, so any detail in that row becomes a
 * streak pointing at the pole. Smoothing that one row (and easing the rows
 * next to it) turns the streaks into an even cap.
 */
function smoothPoleEdge(d: Uint8ClampedArray, north: boolean) {
  const R = 40;
  const ROWS = 6;
  const row = north ? 0 : N - 1;
  const blurred = new Float32Array(N * 4);
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let k = -R; k <= R; k++) sum += d[(row * N + Math.min(N - 1, Math.max(0, k))) * 4 + c];
    for (let x = 0; x < N; x++) {
      blurred[x * 4 + c] = sum / (R * 2 + 1);
      sum += d[(row * N + Math.min(N - 1, x + R + 1)) * 4 + c] - d[(row * N + Math.max(0, x - R)) * 4 + c];
    }
  }
  for (let r = 0; r < ROWS; r++) {
    const y = north ? r : N - 1 - r;
    const w = (ROWS - r) / ROWS;
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      for (let c = 0; c < 4; c++) d[o + c] = d[o + c] + (blurred[x * 4 + c] - d[o + c]) * w;
    }
  }
}

/** Which pole (if either) a tile touches, read from its …/{z}/{y}/{x}.ext address. */
function poleOf(path: string): "north" | "south" | null {
  const m = path.match(/\/(\d+)\/(\d+)\/\d+\.\w+$/);
  if (!m) return null;
  const z = Number(m[1]);
  const y = Number(m[2]);
  return y === 0 ? "north" : y === 2 ** z - 1 ? "south" : null;
}

let registered = false;

export function registerGapFill() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(SCHEME, async (params, abort) => {
    const [path, query = ""] = params.url.replace(`${SCHEME}://`, "https://").split("?");
    const ref = new URLSearchParams(query).get("ref");
    const bitmap = await load(path, abort.signal);
    try {
      const img = pixels(bitmap);
      if (!img) return { data: bitmap };
      const d = img.data;
      const pole = poleOf(path);
      let cut = 0;

      if (!ref) {
        for (let o = 0; o < d.length; o += 4) {
          const a = alphaFor(d[o] + d[o + 1] + d[o + 2]);
          if (a < 255) {
            d[o + 3] = a;
            cut++;
          }
        }
      } else {
        // Infrared composite: only bother with the true-colour check when the tile has dark areas at all.
        let dark = 0;
        for (let o = 0; o < d.length; o += 4) if (d[o] + d[o + 1] + d[o + 2] <= GAP_HI) dark++;
        if (dark / (N * N) >= 0.004) {
          const mask = pixels(await load(path.replace(`/${ref}/`, `/${TRUE_COLOR_LAYER}/`), abort.signal));
          if (mask) {
            const m = mask.data;
            for (let o = 0; o < d.length; o += 4) {
              if (d[o] + d[o + 1] + d[o + 2] > GAP_HI) continue; // bright here means it was imaged
              const a = alphaFor(m[o] + m[o + 1] + m[o + 2]);
              if (a < 255) {
                d[o + 3] = a;
                cut++;
              }
            }
          }
        }
      }

      if (cut) feather(d);
      if (pole) smoothPoleEdge(d, pole === "north");
      return cut || pole ? { data: await createImageBitmap(img) } : { data: bitmap };
    } catch (err) {
      if (abort.signal.aborted) throw err;
      return { data: bitmap }; // filtering is cosmetic — never lose the tile over it
    }
  });
}
