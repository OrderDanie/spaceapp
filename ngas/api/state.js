import supabase from './db-client.js';
import { cors, deviceOf, bodyOf, fail } from './_lib/http.js';

const list = (v, max = 400) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length < 80).slice(0, max) : undefined);

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const device = deviceOf(req);
  if (!device) return fail(res, 400, 'Missing device id');
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('user_state').select('*').eq('device_id', device).limit(1);
      if (error) throw error;
      const row = data && data[0];
      return res.status(200).json({ state: row ? { watchlist: row.watchlist, read_alerts: row.read_alerts, dismissed: row.dismissed, settings: row.settings } : null });
    }
    if (req.method === 'PUT') {
      const b = bodyOf(req);
      const patch = { device_id: device, updated_at: new Date().toISOString() };
      const w = list(b.watchlist, 60);
      const r = list(b.read_alerts);
      const d = list(b.dismissed);
      if (w) patch.watchlist = w;
      if (r) patch.read_alerts = r;
      if (d) patch.dismissed = d;
      if (b.settings && typeof b.settings === 'object' && JSON.stringify(b.settings).length < 2000) patch.settings = b.settings;
      const { data, error } = await supabase.from('user_state').upsert(patch, { onConflict: 'device_id' }).select().single();
      if (error) throw error;
      return res.status(200).json({ state: { watchlist: data.watchlist, read_alerts: data.read_alerts, dismissed: data.dismissed, settings: data.settings } });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('state error:', err);
    return fail(res, 500, err.message || 'Something went wrong');
  }
}
