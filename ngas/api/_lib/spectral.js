/*
 * Epoch spectral engine — shared by the browser and the serverless API.
 *
 * It reads NASA's MODIS "Corrected Reflectance, Bands 7-2-1" composite, where
 * the three colour channels are real spectral bands:
 *     R = band 7  (short-wave infrared, 2.1 µm)
 *     G = band 2  (near infrared,       0.86 µm)
 *     B = band 1  (visible red,         0.65 µm)
 * From those it derives the standard remote-sensing indices
 *     NDVI = (NIR − Red) / (NIR + Red)      vegetation vigour
 *     NBR  = (NIR − SWIR) / (NIR + SWIR)    burn severity
 *     NDSI ≈ (Red − SWIR) / (Red + SWIR)    snow / ice
 * and labels every pixel. The imagery is 8-bit, contrast-stretched browse
 * data, so results are estimates — good for seeing direction and scale of
 * change, not a substitute for calibrated science products.
 */

export const ENGINE = 'epoch-spectral-3';
export const ANALYSIS_LAYER = 'MODIS_Terra_CorrectedReflectance_Bands721';
export const ANALYSIS_MIN_DATE = '2000-02-24';

export const NODATA = 0;
export const WATER = 1;
export const FOREST = 2;
export const VEGETATION = 3;
export const BARE = 4;
export const SNOW = 5;
export const CLOUD = 6;
export const BURN = 7;

export const CLASSES = [
  { id: NODATA, key: 'nodata', label: 'No data', color: [20, 20, 24] },
  { id: WATER, key: 'water', label: 'Open water', color: [10, 132, 255] },
  { id: FOREST, key: 'forest', label: 'Dense canopy', color: [22, 150, 70] },
  { id: VEGETATION, key: 'vegetation', label: 'Grass, crops & shrub', color: [140, 220, 90] },
  { id: BARE, key: 'bare', label: 'Bare ground', color: [201, 164, 116] },
  { id: SNOW, key: 'snow', label: 'Snow, ice & salt', color: [130, 230, 255] },
  { id: CLOUD, key: 'cloud', label: 'Cloud & smoke', color: [236, 236, 240] },
  { id: BURN, key: 'burn', label: 'Burn scar', color: [255, 99, 72] },
];
export const SURFACE_KEYS = ['water', 'forest', 'vegetation', 'bare', 'snow', 'burn'];
export const classByKey = (key) => CLASSES.find((c) => c.key === key) || CLASSES[0];

/** Pixels this dark in the 7-2-1 composite are either deep water or a gap in the swath. */
export const DARK_SUM = 14;
/** In true colour, a real gap is pure black; deep water never is. */
export const GAP_SUM = 12;

/**
 * Label one pixel of a Bands 7-2-1 composite.
 * `gap` is true when the true-colour image is also black here (no satellite data).
 */
export function classifyPixel(swir, nir, red, gap) {
  const sum = swir + nir + red;
  if (sum <= DARK_SUM) return gap ? NODATA : WATER;

  if (nir > 160 && red > 150) {
    // Bright sand is warm: it reflects more short-wave infrared than red light.
    if (swir - red > 14) return BARE;
    // Cloud stays bright in the short-wave infrared; snow, ice and salt go dark.
    return swir >= 76 ? CLOUD : SNOW;
  }

  // Water absorbs both infrared bands.
  if (swir < 52 && nir < 78 && red >= nir - 14) return WATER;
  // Shallow or sediment-laden water: still dark in SWIR, brighter in red.
  if (swir < 66 && red > swir + 34 && red >= nir - 8) return WATER;
  // Sun-glint: water mirrors the sun and turns grey-blue, brightest in red and
  // dimmest in the short-wave infrared. Damp soil is the other way round.
  if (red >= nir + 5 && nir >= swir + 12 && red < 165 && swir < 115) return WATER;

  const ndvi = (nir - red) / (nir + red + 1);
  if (nir > 84 && swir < nir * 0.36 && red < nir * 0.34) return FOREST;
  if (ndvi > 0.125 && nir > 64 && nir >= swir - 4) return VEGETATION;

  const nbr = (nir - swir) / (nir + swir + 1);
  if (nbr < -0.12 && nir < 118 && swir > 88 && red < swir * 0.86) return BURN;

  return BARE;
}

function cellAreas(width, height, geo) {
  // Each pixel is a small lat/lon cell; its ground area shrinks with cos(latitude).
  const halfLat = geo.span / 2;
  const aspect = width / height;
  const halfLon = (halfLat * aspect) / Math.cos((geo.lat * Math.PI) / 180);
  const dLat = geo.span / height;
  const dLon = (halfLon * 2) / width;
  const KM = 111.32;
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    const lat = geo.lat + halfLat - (y + 0.5) * dLat;
    rows[y] = dLat * KM * (dLon * KM * Math.cos((lat * Math.PI) / 180));
  }
  return rows;
}

/** Share of very dark pixels — tells the caller whether a true-colour gap check is needed. */
export function darkShare(data, width, height) {
  let n = 0;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (data[o] + data[o + 1] + data[o + 2] <= DARK_SUM) n++;
  }
  return n / total;
}

/**
 * Classify a whole image.
 * @param {Uint8Array|Uint8ClampedArray} data  RGBA pixels of the 7-2-1 composite
 * @param {number} width
 * @param {number} height
 * @param {{lat:number, span:number}} geo  centre latitude and the latitude span
 *        (degrees) the image covers top to bottom.
 * @param {Uint8Array|Uint8ClampedArray|null} [trueColor]  RGBA pixels of the
 *        true-colour image of the same footprint, used only to tell swath gaps
 *        from deep water. Without it, dark pixels count as water.
 */
export function classifyImage(data, width, height, geo, trueColor) {
  const n = width * height;
  const labels = new Uint8Array(n);
  const px = new Array(CLASSES.length).fill(0);
  const km2 = new Array(CLASSES.length).fill(0);
  let ndviSum = 0;
  let ndviCount = 0;
  const rows = cellAreas(width, height, geo);

  for (let y = 0; y < height; y++) {
    const cell = rows[y];
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const gap = trueColor ? trueColor[o] + trueColor[o + 1] + trueColor[o + 2] <= GAP_SUM : false;
      const c = classifyPixel(data[o], data[o + 1], data[o + 2], gap);
      labels[i] = c;
      px[c]++;
      km2[c] += cell;
      if (c === FOREST || c === VEGETATION || c === BARE || c === BURN) {
        ndviSum += (data[o + 1] - data[o + 2]) / (data[o + 1] + data[o + 2] + 1);
        ndviCount++;
      }
    }
  }

  const total = km2.reduce((a, b) => a + b, 0);
  const round = (v) => Math.round(v * 10) / 10;
  const out = {
    engine: ENGINE,
    width,
    height,
    total_km2: round(total),
    nodata_pct: round((px[NODATA] / n) * 100),
    cloud_pct: round((px[CLOUD] / n) * 100),
    ndvi: ndviCount ? Math.round((ndviSum / ndviCount) * 1000) / 1000 : null,
  };
  for (const c of CLASSES) {
    if (c.id === NODATA || c.id === CLOUD) continue;
    out[`${c.key}_km2`] = round(km2[c.id]);
  }
  // Ground actually seen (cloud and gaps removed).
  out.clear_km2 = round(total - km2[CLOUD] - km2[NODATA]);
  return { stats: out, labels };
}

/** Is this measurement trustworthy enough to chart? */
export function quality(stats) {
  if (!stats) return 'none';
  const hidden = (stats.cloud_pct || 0) + (stats.nodata_pct || 0);
  if ((stats.nodata_pct || 0) > 60) return 'none';
  if (hidden > 45) return 'poor';
  if (hidden > 18) return 'fair';
  return 'good';
}

/**
 * Pixel-by-pixel change between two classified scenes of the same footprint.
 * Returns a transition table in km² and a per-pixel change code:
 *   0 unchanged / not comparable, 1 water lost, 2 water gained,
 *   3 canopy lost, 4 greener, 5 newly burned, 6 snow/ice lost, 7 snow/ice gained,
 *   8 vegetation lost
 */
export function diffLabels(a, b, width, height, geo) {
  const n = width * height;
  const change = new Uint8Array(n);
  const rows = cellAreas(width, height, geo);
  const t = {
    water_lost: 0,
    water_gained: 0,
    forest_lost: 0,
    vegetation_lost: 0,
    greener: 0,
    burned: 0,
    snow_lost: 0,
    snow_gained: 0,
    comparable: 0,
    changed: 0,
  };
  const green = (c) => c === FOREST || c === VEGETATION;
  for (let y = 0; y < height; y++) {
    const cell = rows[y];
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = a[i];
      const q = b[i];
      // Only compare ground that was visible in both scenes.
      if (p === NODATA || q === NODATA || p === CLOUD || q === CLOUD) continue;
      t.comparable += cell;
      if (p === q) continue;
      let code = 0;
      if (p === WATER) (code = 1), (t.water_lost += cell);
      else if (q === WATER) (code = 2), (t.water_gained += cell);
      else if (q === BURN) (code = 5), (t.burned += cell);
      else if (p === FOREST) (code = 3), (t.forest_lost += cell);
      else if (green(p) && !green(q)) (code = 8), (t.vegetation_lost += cell);
      else if (green(q) && (!green(p) || q === FOREST)) (code = 4), (t.greener += cell);
      else if (p === SNOW) (code = 6), (t.snow_lost += cell);
      else if (q === SNOW) (code = 7), (t.snow_gained += cell);
      if (code) {
        change[i] = code;
        t.changed += cell;
      }
    }
  }
  for (const k of Object.keys(t)) t[k] = Math.round(t[k] * 10) / 10;
  return { transitions: t, change };
}

export const CHANGES = [
  null,
  { key: 'water_lost', label: 'Water lost', color: [255, 69, 58] },
  { key: 'water_gained', label: 'Water gained', color: [10, 132, 255] },
  { key: 'forest_lost', label: 'Canopy lost', color: [255, 159, 10] },
  { key: 'greener', label: 'Greener', color: [48, 209, 88] },
  { key: 'burned', label: 'Newly burned', color: [255, 55, 95] },
  { key: 'snow_lost', label: 'Snow / ice lost', color: [191, 90, 242] },
  { key: 'snow_gained', label: 'Snow / ice gained', color: [100, 210, 255] },
  { key: 'vegetation_lost', label: 'Vegetation lost', color: [255, 214, 10] },
];

/* ------------------------------ geometry ------------------------------ */
export function bboxFor(lat, lon, span, aspect) {
  const halfLat = span / 2;
  const halfLon = (halfLat * aspect) / Math.cos((lat * Math.PI) / 180);
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat];
}

export const ANALYSIS_SIZE = [480, 300];

/** WMS URL for the analysis composite of a footprint on a given day. */
export function analysisUrl(lat, lon, span, date, size = ANALYSIS_SIZE, layer = ANALYSIS_LAYER) {
  const [w, h] = size;
  const bbox = bboxFor(lat, lon, span, w / h)
    .map((v) => v.toFixed(4))
    .join(',');
  return (
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
    `&LAYERS=${layer}&STYLES=&FORMAT=image/jpeg&SRS=EPSG:4326` +
    `&BBOX=${bbox}&WIDTH=${w}&HEIGHT=${h}&TIME=${date}`
  );
}

export const TRUE_COLOR_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor';
/** True-colour image of the same footprint — only used to find swath gaps. */
export const gapCheckUrl = (lat, lon, span, date, size = ANALYSIS_SIZE) => analysisUrl(lat, lon, span, date, size, TRUE_COLOR_LAYER);

/* ------------------------------ metrics ------------------------------ */
export const TARGETS = {
  water: { key: 'water', label: 'Open water', short: 'water', unit: 'km²', goodWhenUp: true, color: '#0a84ff' },
  flood: { key: 'flood', label: 'Flooded area', short: 'floodwater', unit: 'km²', goodWhenUp: false, color: '#5e5ce6' },
  forest: { key: 'forest', label: 'Dense canopy', short: 'canopy', unit: 'km²', goodWhenUp: true, color: '#30d158' },
  vegetation: { key: 'vegetation', label: 'Green cover', short: 'green cover', unit: 'km²', goodWhenUp: true, color: '#8cdc5a' },
  snow: { key: 'snow', label: 'Snow & ice', short: 'snow and ice', unit: 'km²', goodWhenUp: true, color: '#64d2ff' },
  burn: { key: 'burn', label: 'Burn scar', short: 'burn scar', unit: 'km²', goodWhenUp: false, color: '#ff6348' },
};
export const targetOf = (key) => TARGETS[key] || TARGETS.water;

/** The tracked quantity for a place, in km², from one measurement. */
export function metricValue(stats, target) {
  if (!stats) return null;
  switch (target) {
    case 'forest':
      return stats.forest_km2 ?? null;
    case 'vegetation':
      return stats.forest_km2 == null ? null : Math.round((stats.forest_km2 + stats.vegetation_km2) * 10) / 10;
    case 'snow':
      return stats.snow_km2 ?? null;
    case 'burn':
      return stats.burn_km2 ?? null;
    case 'flood':
    case 'water':
    default:
      return stats.water_km2 ?? null;
  }
}

/** Trend points that are clear enough to trust, oldest first. */
export function validPoints(rows, target) {
  return (rows || [])
    .filter((r) => r.quality === 'good' || r.quality === 'fair')
    .map((r) => ({ year: Number(r.date.slice(0, 4)), date: r.used_date || r.date, value: metricValue(r, target), quality: r.quality }))
    .filter((p) => p.value != null)
    .sort((a, b) => a.year - b.year);
}

/**
 * Headline change across a record: the median of the first three clear years
 * against the median of the latest three. One hazy or sun-glinted scene at
 * either end cannot swing the result. Short records fall back to end points.
 */
export function trendChange(points) {
  if (!points || points.length < 2) return null;
  const k = points.length >= 6 ? 3 : 1;
  const median = (arr) => arr.map((p) => p.value).sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const from = median(points.slice(0, k));
  const to = median(points.slice(-k));
  const change = from ? ((to - from) / from) * 100 : null;
  return { from, to, pct: change != null && Number.isFinite(change) ? change : null, smoothed: k > 1 };
}

export const pct = (from, to) => (from ? ((to - from) / from) * 100 : null);

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export const fmtKm2 = (v) => (v == null ? '—' : `${Math.abs(v) < 100 ? nf1.format(v) : nf0.format(v)} km²`);
export const fmtPct = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v) < 10 ? nf1.format(Math.abs(v)) : nf0.format(Math.abs(v))}%`);

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDay = (iso) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

/**
 * Plain-language reading of a two-date comparison. Every number in the text
 * comes straight from the measurements passed in.
 */
export function narrate({ name, target, a, b, transitions }) {
  const t = targetOf(target);
  const va = metricValue(a, target);
  const vb = metricValue(b, target);
  const lines = [];
  const qa = quality(a);
  const qb = quality(b);
  if (qa === 'none' || qb === 'none') {
    const bad = qa === 'none' ? a : b;
    return {
      headline: 'No imagery for one of these dates',
      lines: [`The satellite has no usable data over ${name} on ${fmtDay(bad.date)}. Pick a nearby date and I’ll measure again.`],
      delta: null,
    };
  }
  const d = pct(va, vb);
  const dir = vb > va ? 'grew' : vb < va ? 'shrank' : 'held steady';
  let headline;
  if (va === 0 && vb === 0) headline = `No ${t.short} detected on either date`;
  else if (d == null) headline = `${t.label} appeared: ${fmtKm2(vb)}`;
  else if (Math.abs(d) < 2) headline = `${t.label} is essentially unchanged`;
  else headline = `${t.label} ${dir} ${fmtPct(d).replace(/^[+−]/, '')}`;
  lines.push(
    `${t.label} over ${name} measured ${fmtKm2(va)} on ${fmtDay(a.date)} and ${fmtKm2(vb)} on ${fmtDay(b.date)}` +
      (d == null ? '.' : ` — a change of ${fmtPct(d)}.`)
  );
  if (transitions) {
    const parts = [];
    const add = (v, text) => v >= Math.max(1, transitions.comparable * 0.002) && parts.push([v, text]);
    add(transitions.water_lost, `${fmtKm2(transitions.water_lost)} that was water is now land`);
    add(transitions.water_gained, `${fmtKm2(transitions.water_gained)} of land is now under water`);
    add(transitions.forest_lost, `${fmtKm2(transitions.forest_lost)} of dense canopy thinned or was cleared`);
    add(transitions.burned, `${fmtKm2(transitions.burned)} shows a fresh burn signature`);
    add(transitions.vegetation_lost, `${fmtKm2(transitions.vegetation_lost)} of green cover turned bare`);
    add(transitions.greener, `${fmtKm2(transitions.greener)} became greener`);
    add(transitions.snow_lost, `${fmtKm2(transitions.snow_lost)} of snow, ice or salt crust disappeared`);
    add(transitions.snow_gained, `${fmtKm2(transitions.snow_gained)} of new snow, ice or salt crust appeared`);
    parts.sort((x, y) => y[0] - x[0]);
    if (parts.length) lines.push(`Pixel by pixel: ${parts.slice(0, 3).map((p) => p[1]).join('; ')}.`);
    else lines.push('Pixel by pixel, almost nothing switched class between the two scenes.');
  }
  const caveats = [];
  const hid = (s) => Math.round((s.cloud_pct || 0) + (s.nodata_pct || 0));
  if (hid(a) >= 12) caveats.push(`${hid(a)}% of the ${a.date.slice(0, 4)} scene is hidden by cloud, smoke or gaps`);
  if (hid(b) >= 12) caveats.push(`${hid(b)}% of the ${b.date.slice(0, 4)} scene is hidden`);
  if (a.date.slice(5, 7) !== b.date.slice(5, 7)) caveats.push('the dates fall in different months, so part of this is seasonal');
  if (caveats.length) lines.push(`Read with care: ${caveats.join('; ')}.`);
  return { headline, lines, delta: d };
}
