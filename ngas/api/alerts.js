import supabase from './db-client.js';
import { cors, deviceOf, bodyOf, fail } from './_lib/http.js';
import { loadPlace, loadPlaces, cachedSeries } from './_lib/measure.js';
import { evaluate, saveAlerts } from './_lib/alerts.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const device = deviceOf(req);
  try {
    if (req.method === 'GET') {
      const places = await loadPlaces(device);
      const ids = places.map((p) => p.id);
      if (!ids.length) return res.status(200).json({ alerts: [] });
      const { data, error } = await supabase.from('alerts').select('*').in('place_id', ids).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return res.status(200).json({ alerts: data || [] });
    }
    if (req.method === 'POST') {
      // Re-read the measured trend for one place and record anything notable.
      const { placeId } = bodyOf(req);
      const place = placeId ? await loadPlace(String(placeId), device) : null;
      if (!place) return fail(res, 404, 'Unknown place');
      const rows = await cachedSeries({ id: place.id, lat: place.lat, lon: place.lon, span: place.span });
      const found = evaluate(place, rows);
      await saveAlerts(found);
      const { data, error } = await supabase.from('alerts').select('*').eq('place_id', place.id).order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ alerts: data || [], evaluated: found.length });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('alerts error:', err);
    return fail(res, 500, err.message || 'Something went wrong');
  }
}
