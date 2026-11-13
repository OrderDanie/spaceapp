import { cors, fail } from './_lib/http.js';
import { fetchEvents, EVENT_CATEGORIES } from './_lib/eonet.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  try {
    const events = await fetchEvents({ days: req.query.days, category: req.query.category });
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ events, categories: EVENT_CATEGORIES, source: 'NASA EONET v3', fetched_at: new Date().toISOString() });
  } catch (err) {
    console.error('events error:', err);
    return fail(res, 502, 'NASA EONET is not responding right now.');
  }
}
