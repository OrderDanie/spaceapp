import supabase from './db-client.js';
import { cors, deviceOf, bodyOf, fail, latestISO } from './_lib/http.js';
import { loadPlaces, publicPlace } from './_lib/measure.js';
import { geocode } from './_lib/geo.js';
import { TARGETS } from './_lib/spectral.js';

const CATEGORY_FOR = { water: 'Water', flood: 'Flood', forest: 'Forest', vegetation: 'Wetland', snow: 'Ice', burn: 'Fire' };
const COLOR_FOR = { water: '#64d2ff', flood: '#5e5ce6', forest: '#30d158', vegetation: '#66d4cf', snow: '#a5e8ff', burn: '#ff9f0a' };
const MAX_CUSTOM = 24;

export function buildCustomPlace(input, device) {
  const name = String(input.name || '').trim().slice(0, 60);
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  const span = Math.min(10, Math.max(0.3, Number(input.span) || 1.5));
  const target = TARGETS[input.target] ? input.target : 'water';
  const errors = {};
  if (name.length < 2) errors.name = 'Give this place a name (2 characters or more).';
  if (!Number.isFinite(lat) || Math.abs(lat) > 84) errors.lat = 'Latitude must be between −84 and 84.';
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) errors.lon = 'Longitude must be between −180 and 180.';
  if (Object.keys(errors).length) return { errors };

  // Late summer keeps seasonal snow out of the picture in both hemispheres.
  const md = lat >= 0 ? '08-15' : '02-15';
  const latest = latestISO();
  const lastYear = `${latest.slice(0, 4)}-${md}` <= latest ? Number(latest.slice(0, 4)) : Number(latest.slice(0, 4)) - 1;
  const id = `c-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`;
  return {
    row: {
      id,
      name,
      region: String(input.region || '').trim().slice(0, 80) || `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
      category: CATEGORY_FOR[target],
      status: 'Watching',
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      span,
      zoom: Math.round((8.35 - Math.log2(span) * 1.05) * 10) / 10,
      layer: 'truecolor',
      before_date: `2001-${md}`,
      after_date: `${lastYear}-${md}`,
      year_start: 2001,
      month_day: md,
      target,
      headline: `Tracked since ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
      summary: `A place you added. Epoch measures ${TARGETS[target].short} here once a year from NASA MODIS imagery, on the clearest day around ${md.replace('-', '/')}.`,
      color: COLOR_FOR[target],
      device_id: device,
      sort: 1000,
    },
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const device = deviceOf(req);
  try {
    if (req.method === 'GET') {
      if (req.query.search !== undefined) {
        const results = await geocode(req.query.search, 6);
        return res.status(200).json({ results });
      }
      const places = await loadPlaces(device);
      return res.status(200).json({ places });
    }

    if (!device) return fail(res, 400, 'Missing device id');

    if (req.method === 'POST') {
      const built = buildCustomPlace(bodyOf(req), device);
      if (built.errors) return res.status(400).json({ error: 'Check the highlighted fields.', fields: built.errors });
      const { count, error: cErr } = await supabase.from('places').select('id', { count: 'exact', head: true }).eq('device_id', device);
      if (cErr) throw cErr;
      if ((count || 0) >= MAX_CUSTOM) return fail(res, 400, `You can track up to ${MAX_CUSTOM} places of your own. Remove one first.`);
      const { data, error } = await supabase.from('places').insert(built.row).select().single();
      if (error) throw error;
      return res.status(201).json({ place: publicPlace(data) });
    }

    if (req.method === 'PUT') {
      const { id, name } = bodyOf(req);
      const clean = String(name || '').trim().slice(0, 60);
      if (!id || clean.length < 2) return fail(res, 400, 'A name of 2 characters or more is required.');
      const { data, error } = await supabase.from('places').update({ name: clean }).eq('id', id).eq('device_id', device).select();
      if (error) throw error;
      if (!data || !data.length) return fail(res, 404, 'That place is not one you added.');
      return res.status(200).json({ place: publicPlace(data[0]) });
    }

    if (req.method === 'DELETE') {
      const { id } = bodyOf(req);
      if (!id) return fail(res, 400, 'Missing place id');
      const { data, error } = await supabase.from('places').delete().eq('id', id).eq('device_id', device).select('id');
      if (error) throw error;
      if (!data || !data.length) return fail(res, 404, 'Only places you added can be removed.');
      await supabase.from('measurements').delete().eq('place_key', `place:${id}`);
      await supabase.from('alerts').delete().eq('place_id', id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('places error:', err);
    return fail(res, 500, err.message || 'Something went wrong');
  }
}
