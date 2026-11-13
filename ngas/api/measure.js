import { cors, deviceOf, fail, isISO, latestISO } from './_lib/http.js';
import { loadPlace, loadPlaces, measure, cachedSeries, cachedSeriesFor, compareDays, seriesDates } from './_lib/measure.js';
import { ANALYSIS_MIN_DATE, ENGINE } from './_lib/spectral.js';

export const config = { maxDuration: 45 };

async function footprint(req, device) {
  const { placeId } = req.query;
  if (placeId) {
    const place = await loadPlace(String(placeId), device);
    if (!place) return { error: 'Unknown place' };
    return { geo: { id: place.id, lat: place.lat, lon: place.lon, span: place.span }, place };
  }
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const span = Number(req.query.span);
  if (!Number.isFinite(lat) || Math.abs(lat) > 84 || !Number.isFinite(lon) || Math.abs(lon) > 180) return { error: 'lat and lon are required' };
  if (!Number.isFinite(span) || span < 0.2 || span > 12) return { error: 'span must be between 0.2 and 12 degrees' };
  return { geo: { lat, lon, span } };
}

const validDay = (d) => isISO(d) && d >= ANALYSIS_MIN_DATE && d <= latestISO();

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  try {
    const device = deviceOf(req);
    if (req.query.all) {
      // One round-trip at launch: every trend already on file for this browser's places.
      const places = await loadPlaces(device);
      return res.status(200).json({ engine: ENGINE, series: await cachedSeriesFor(places) });
    }
    const fp = await footprint(req, device);
    if (fp.error) return fail(res, 400, fp.error);
    const { geo, place } = fp;

    if (req.query.series) {
      if (!place) return fail(res, 400, 'series needs a placeId');
      const rows = await cachedSeries(geo);
      const dates = seriesDates(place);
      const have = new Set(rows.map((r) => r.date));
      return res.status(200).json({ engine: ENGINE, rows, missing: dates.filter((d) => !have.has(d)) });
    }

    const { a, b, date } = req.query;
    if (a || b) {
      if (!validDay(a) || !validDay(b)) return fail(res, 400, `Dates must be between ${ANALYSIS_MIN_DATE} and ${latestISO()}`);
      const out = await compareDays(geo, a, b);
      return res.status(200).json(out);
    }

    if (!validDay(date)) return fail(res, 400, `date must be between ${ANALYSIS_MIN_DATE} and ${latestISO()}`);
    const row = await measure(geo, date, { best: req.query.best === '1', target: place?.target || String(req.query.target || 'water') });
    return res.status(200).json({ measurement: row });
  } catch (err) {
    console.error('measure error:', err);
    return fail(res, 502, err.message || 'Could not read NASA imagery');
  }
}
