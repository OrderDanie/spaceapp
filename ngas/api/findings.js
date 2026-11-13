import supabase from './db-client.js';
import { cors, deviceOf, bodyOf, fail, isISO } from './_lib/http.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const device = deviceOf(req);
  if (!device) return fail(res, 400, 'Missing device id');
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('findings').select('*').eq('device_id', device).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return res.status(200).json({ findings: data || [] });
    }
    if (req.method === 'POST') {
      const b = bodyOf(req);
      const name = String(b.place_name || '').trim().slice(0, 80);
      if (!name || !isISO(b.date_a) || !isISO(b.date_b)) return fail(res, 400, 'A place and two dates are required.');
      const row = {
        device_id: device,
        place_id: b.place_id ? String(b.place_id).slice(0, 40) : null,
        place_name: name,
        lat: Number(b.lat) || 0,
        lon: Number(b.lon) || 0,
        span: Number(b.span) || 1,
        date_a: b.date_a,
        date_b: b.date_b,
        target: String(b.target || 'water').slice(0, 20),
        headline: String(b.headline || '').slice(0, 200),
        summary: String(b.summary || '').slice(0, 1500),
        result: b.result && JSON.stringify(b.result).length < 6000 ? b.result : null,
      };
      const { data, error } = await supabase.from('findings').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json({ finding: data });
    }
    if (req.method === 'DELETE') {
      const { id } = bodyOf(req);
      if (!id) return fail(res, 400, 'Missing id');
      const { error } = await supabase.from('findings').delete().eq('id', id).eq('device_id', device);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('findings error:', err);
    return fail(res, 500, err.message || 'Something went wrong');
  }
}
