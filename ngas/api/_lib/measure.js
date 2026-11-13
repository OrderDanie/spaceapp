import jpeg from 'jpeg-js';
import supabase from '../db-client.js';
import * as S from './spectral.js';
import { addDays, latestISO } from './http.js';

async function fetchPixels(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`NASA GIBS answered ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('jpeg')) throw new Error('NASA GIBS returned no image for that request');
  const buf = Buffer.from(await res.arrayBuffer());
  return jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
}

/** Download the analysis composite for one day and classify it. */
export async function classifyDay(geo, date) {
  const [w, h] = S.ANALYSIS_SIZE;
  const im = await fetchPixels(S.analysisUrl(geo.lat, geo.lon, geo.span, date));
  let trueColor = null;
  // Black pixels are deep water or a swath gap; true colour tells them apart.
  if (S.darkShare(im.data, w, h) > 0.004) {
    try {
      trueColor = (await fetchPixels(S.gapCheckUrl(geo.lat, geo.lon, geo.span, date))).data;
    } catch {
      trueColor = null;
    }
  }
  const { stats, labels } = S.classifyImage(im.data, w, h, { lat: geo.lat, span: geo.span }, trueColor);
  stats.date = date;
  return { stats, labels };
}

const hidden = (s) => (s.cloud_pct || 0) + (s.nodata_pct || 0);
const OFFSETS = [0, 1, -1, 2, -2, 3, -3, 5, -5];

/**
 * The most representative scene within a few days of `date`.
 *
 * Cloud, smoke and sun-glint hide the surface on some days, and thin haze can
 * mimic water on others, so one day is a poor sample. This reads nine
 * neighbouring days, keeps the clearest ones, and returns the day whose
 * reading is the median of that group — robust to outliers in both directions.
 */
export async function clearestDay(geo, date, target = 'water') {
  const max = latestISO();
  const days = [...new Set(OFFSETS.map((o) => addDays(date, o)).filter((d) => d >= S.ANALYSIS_MIN_DATE && d <= max))];
  const seen = [];
  for (let i = 0; i < days.length; i += 5) {
    const batch = await Promise.all(days.slice(i, i + 5).map((d) => classifyDay(geo, d).catch(() => null)));
    for (const r of batch) if (r && S.quality(r.stats) !== 'none') seen.push(r);
  }
  if (!seen.length) {
    // Nothing usable nearby (e.g. the August 2000 Terra outage): report the gap honestly.
    const r = await classifyDay(geo, date);
    r.stats.candidates = 0;
    return r;
  }
  const clearest = Math.min(...seen.map((r) => hidden(r.stats)));
  const eligible = seen.filter((r) => hidden(r.stats) <= Math.max(clearest + 6, 10));
  const value = (r) => S.metricValue(r.stats, target) || 0;
  eligible.sort((a, b) => value(a) - value(b) || hidden(a.stats) - hidden(b.stats));
  const pick = eligible[Math.floor(eligible.length / 2)];
  pick.stats.candidates = eligible.length;
  pick.stats.picked_for = target;
  return pick;
}

export const placeKey = (geo) =>
  geo.id ? `place:${geo.id}` : `geo:${geo.lat.toFixed(3)},${geo.lon.toFixed(3)},${geo.span.toFixed(3)}`;

const shape = (row) => ({
  ...row.stats,
  date: row.date,
  used_date: row.used_date,
  best: row.best,
  quality: S.quality(row.stats),
});

/** Days this recent can still be re-processed by NASA, so they are not cached. */
const settled = (date) => date <= addDays(latestISO(), -2);

/** Measurement for a footprint and date — from the database when already computed. */
export async function measure(geo, date, { best = false, target = 'water' } = {}) {
  const key = placeKey(geo);
  const { data: hit } = await supabase
    .from('measurements')
    .select('*')
    .eq('place_key', key)
    .eq('date', date)
    .eq('best', best)
    .eq('engine', S.ENGINE)
    .order('id', { ascending: true })
    .limit(1);
  if (hit && hit.length) return shape(hit[0]);

  const { stats } = best ? await clearestDay(geo, date, target) : await classifyDay(geo, date);
  const row = { place_key: key, date, best, used_date: stats.date, engine: S.ENGINE, stats };
  if (settled(date)) {
    const { error } = await supabase.from('measurements').insert(row);
    if (error) console.error('measurement cache write failed:', error.message);
  }
  return shape(row);
}

/** Everything already measured for a place's yearly trend. */
export async function cachedSeries(geo) {
  const { data, error } = await supabase
    .from('measurements')
    .select('*')
    .eq('place_key', placeKey(geo))
    .eq('best', true)
    .eq('engine', S.ENGINE)
    .order('date', { ascending: true });
  if (error) throw error;
  const seen = new Set();
  return (data || []).filter((r) => (seen.has(r.date) ? false : (seen.add(r.date), true))).map(shape);
}

/** Every cached trend row for a set of places, grouped by place id. */
export async function cachedSeriesFor(places) {
  const keys = places.map((p) => `place:${p.id}`);
  const out = Object.fromEntries(places.map((p) => [p.id, []]));
  if (!keys.length) return out;
  const seen = new Set();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('measurements')
      .select('*')
      .in('place_key', keys)
      .eq('best', true)
      .eq('engine', S.ENGINE)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data || []) {
      const k = `${r.place_key}|${r.date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out[r.place_key.slice(6)]?.push(shape(r));
    }
    if (!data || data.length < 1000) break;
  }
  for (const id of Object.keys(out)) out[id].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

/** Two exact dates, classified and compared pixel by pixel. */
export async function compareDays(geo, a, b) {
  const [ra, rb] = await Promise.all([classifyDay(geo, a), classifyDay(geo, b)]);
  const [w, h] = S.ANALYSIS_SIZE;
  const { transitions } = S.diffLabels(ra.labels, rb.labels, w, h, { lat: geo.lat, span: geo.span });
  const key = placeKey(geo);
  const rows = [ra, rb]
    .filter((r) => settled(r.stats.date))
    .map((r) => ({ place_key: key, date: r.stats.date, best: false, used_date: r.stats.date, engine: S.ENGINE, stats: r.stats }));
  if (rows.length) {
    // Keep the cache free of duplicates for dates that were already stored.
    const { data: have } = await supabase
      .from('measurements')
      .select('date')
      .eq('place_key', key)
      .eq('best', false)
      .eq('engine', S.ENGINE)
      .in('date', rows.map((r) => r.date));
    const known = new Set((have || []).map((r) => r.date));
    const fresh = rows.filter((r) => !known.has(r.date));
    if (fresh.length) await supabase.from('measurements').insert(fresh);
  }
  const wrap = (r) => ({ date: r.stats.date, used_date: r.stats.date, best: false, quality: S.quality(r.stats), ...r.stats });
  return { a: wrap(ra), b: wrap(rb), transitions };
}

/** The yearly sample dates for a place's trend (same calendar day each year). */
export function seriesDates(place) {
  const max = latestISO();
  const out = [];
  const last = Number(max.slice(0, 4));
  for (let y = place.year_start; y <= last; y++) {
    const d = `${y}-${place.month_day}`;
    if (d >= S.ANALYSIS_MIN_DATE && d <= max) out.push(d);
  }
  return out;
}

const COLS = 'id,name,region,category,status,lat,lon,span,zoom,layer,before_date,after_date,year_start,month_day,target,headline,summary,color,device_id,sort';

export const publicPlace = (r) => ({
  id: r.id,
  name: r.name,
  region: r.region,
  category: r.category,
  status: r.status,
  lat: r.lat,
  lon: r.lon,
  span: r.span,
  zoom: r.zoom,
  layer: r.layer,
  before: r.before_date,
  after: r.after_date,
  year_start: r.year_start,
  month_day: r.month_day,
  target: r.target,
  headline: r.headline,
  summary: r.summary,
  color: r.color,
  custom: !!r.device_id,
});

/** Curated places plus the ones this browser added. */
export async function loadPlaces(device) {
  const curated = supabase.from('places').select(COLS).is('device_id', null).order('sort', { ascending: true });
  const mine = device
    ? supabase.from('places').select(COLS).eq('device_id', device).order('created_at', { ascending: true })
    : Promise.resolve({ data: [], error: null });
  const [a, b] = await Promise.all([curated, mine]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return [...(a.data || []), ...(b.data || [])].map(publicPlace);
}

export async function loadPlace(id, device) {
  const { data, error } = await supabase.from('places').select(COLS).eq('id', id).limit(1);
  if (error) throw error;
  const row = data && data[0];
  if (!row) return null;
  if (row.device_id && row.device_id !== device) return null;
  return publicPlace(row);
}
