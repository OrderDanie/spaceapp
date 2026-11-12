// NASA GIBS (Global Imagery Browse Services) helpers.
// Public, keyless endpoints — https://nasa-gibs.github.io/gibs-api-docs/

export type LayerId = "truecolor" | "viirs" | "landwater" | "snowice";

export interface ImageryLayer {
  id: LayerId;
  name: string;
  short: string;
  description: string;
  gibs: string;
  matrix: string;
  ext: "jpg" | "png";
  minDate: string;
  sensor: string;
  resolution: string;
  swatch: string;
}

export const LAYERS: ImageryLayer[] = [
  {
    id: "viirs",
    name: "True Color · VIIRS",
    short: "VIIRS",
    description: "Seamless daily mosaic from NOAA-20. Best for recent days.",
    gibs: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    matrix: "GoogleMapsCompatible_Level9",
    ext: "jpg",
    minDate: "2018-01-01",
    sensor: "NOAA-20 · VIIRS",
    resolution: "375 m",
    swatch: "linear-gradient(135deg,#1d4e89,#3b8d5a 55%,#d9c8a0)",
  },
  {
    id: "truecolor",
    name: "True Color · MODIS",
    short: "True Color",
    description: "Natural color, as your eye would see it. Archive back to 2000.",
    gibs: "MODIS_Terra_CorrectedReflectance_TrueColor",
    matrix: "GoogleMapsCompatible_Level9",
    ext: "jpg",
    minDate: "2000-02-24",
    sensor: "Terra · MODIS",
    resolution: "250 m",
    swatch: "linear-gradient(135deg,#123c69,#2f7d4f 50%,#cbb68a)",
  },
  {
    id: "landwater",
    name: "Land & Water",
    short: "Bands 7-2-1",
    description: "Water turns deep blue, burn scars red-brown, vegetation green.",
    gibs: "MODIS_Terra_CorrectedReflectance_Bands721",
    matrix: "GoogleMapsCompatible_Level9",
    ext: "jpg",
    minDate: "2000-02-24",
    sensor: "Terra · MODIS",
    resolution: "250 m",
    swatch: "linear-gradient(135deg,#071a4a,#1f9d55 50%,#c97b63)",
  },
  {
    id: "snowice",
    name: "Snow & Ice",
    short: "Bands 3-6-7",
    description: "Snow and ice glow red-orange; liquid water stays black.",
    gibs: "MODIS_Terra_CorrectedReflectance_Bands367",
    matrix: "GoogleMapsCompatible_Level9",
    ext: "jpg",
    minDate: "2000-02-24",
    sensor: "Terra · MODIS",
    resolution: "500 m",
    swatch: "linear-gradient(135deg,#050a1f,#e0522c 55%,#ffd0a8)",
  },
];

export const layerById = (id: LayerId) => LAYERS.find((l) => l.id === id) ?? LAYERS[0];

const GIBS = "https://gibs.earthdata.nasa.gov";

/** XYZ tile template for web-mercator maps (MapLibre). */
export function tileUrl(layer: ImageryLayer, date: string) {
  return `${GIBS}/wmts/epsg3857/best/${layer.gibs}/default/${date}/${layer.matrix}/{z}/{y}/{x}.${layer.ext}`;
}

/**
 * Same template across GIBS's a/b/c mirrors. MapLibre rotates hosts per
 * tile, which lifts the per-host connection cap and fills the globe faster.
 */
export function tileUrls(layer: ImageryLayer, date: string) {
  return ["gibs-a", "gibs-b", "gibs-c"].map(
    (host) => `https://${host}.earthdata.nasa.gov/wmts/epsg3857/best/${layer.gibs}/default/${date}/${layer.matrix}/{z}/{y}/{x}.${layer.ext}`
  );
}

/** One canonical Compare-stage size per quality tier — shared by the view
 *  and by prefetchers, so warmed URLs are byte-identical cache hits. */
export const compareSnapshotSize = (hd: boolean): [number, number] => (hd ? [1600, 1000] : [1120, 700]);

export interface SnapshotOpts {
  layer: LayerId;
  date: string;
  lat: number;
  lon: number;
  span: number; // degrees of latitude visible vertically
  width: number;
  height: number;
}

export function bboxFor(lat: number, lon: number, span: number, aspect: number) {
  const halfLat = span / 2;
  const halfLon = (halfLat * aspect) / Math.cos((lat * Math.PI) / 180);
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat];
}

/** Single georeferenced image via WMS GetMap (EPSG:4326, aspect-corrected). */
export function snapshotUrl(o: SnapshotOpts) {
  const layer = layerById(o.layer);
  const w = Math.round(o.width);
  const h = Math.round(o.height);
  const bbox = bboxFor(o.lat, o.lon, o.span, w / h)
    .map((n) => n.toFixed(4))
    .join(",");
  return (
    `${GIBS}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
    `&LAYERS=${layer.gibs}&STYLES=&FORMAT=image/jpeg&SRS=EPSG:4326` +
    `&BBOX=${bbox}&WIDTH=${w}&HEIGHT=${h}&TIME=${o.date}`
  );
}

/** Whole-Earth equirectangular texture (used for the animated globe). */
export function globeTextureUrl(width = 2048, date = "2024-03-20") {
  return (
    `${GIBS}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
    `&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor&STYLES=&FORMAT=image/jpeg&SRS=EPSG:4326` +
    `&BBOX=-180,-90,180,90&WIDTH=${width}&HEIGHT=${width / 2}&TIME=${date}`
  );
}

export function worldviewUrl(lat: number, lon: number, span: number, date: string, layer: LayerId) {
  const b = bboxFor(lat, lon, span, 1.6).map((n) => n.toFixed(3)).join(",");
  return `https://worldview.earthdata.nasa.gov/?v=${b}&l=${layerById(layer).gibs}&t=${date}`;
}

/* ------------------------------ Dates (UTC) ------------------------------ */
export const DAY_MS = 86_400_000;
export const toISO = (d: Date) => d.toISOString().slice(0, 10);
export function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const addDays = (iso: string, n: number) => toISO(new Date(parseISO(iso).getTime() + n * DAY_MS));
export const diffDays = (a: string, b: string) =>
  Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / DAY_MS);
export const todayISO = () => toISO(new Date());
export const latestISO = () => addDays(todayISO(), -1);
export const yearOf = (iso: string) => Number(iso.slice(0, 4));
export const monthOf = (iso: string) => Number(iso.slice(5, 7));

export function withYearMonth(iso: string, year: number, month = monthOf(iso)) {
  const day = Number(iso.slice(8, 10));
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, max)).padStart(2, "0")}`;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function fmtDate(iso: string, style: "short" | "medium" | "long" | "month" | "monthYear" | "dayMonth" = "medium") {
  const opts: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: "short", day: "numeric" },
    medium: { month: "short", day: "numeric", year: "numeric" },
    long: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    month: { month: "short" },
    monthYear: { month: "short", year: "numeric" },
    dayMonth: { day: "numeric", month: "short" },
  };
  let f = fmtCache.get(style);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts[style] });
    fmtCache.set(style, f);
  }
  return f.format(parseISO(iso));
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
