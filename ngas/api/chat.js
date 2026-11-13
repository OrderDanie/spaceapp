import supabase from './db-client.js';
import { cors, deviceOf, bodyOf, fail } from './_lib/http.js';
import { loadPlaces } from './_lib/measure.js';
import { answer } from './_lib/assistant.js';

export const config = { maxDuration: 45 };

const shape = (r) => ({ id: r.id, role: r.role, content: r.content, payload: r.payload || null, created_at: r.created_at });

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const device = deviceOf(req);
  if (!device) return fail(res, 400, 'Missing device id');
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('chat_messages').select('*').eq('device_id', device).order('id', { ascending: false }).limit(60);
      if (error) throw error;
      return res.status(200).json({ messages: (data || []).reverse().map(shape) });
    }
    if (req.method === 'POST') {
      const b = bodyOf(req);
      const text = String(b.text || '').trim().slice(0, 400);
      if (!text) return fail(res, 400, 'Type a question first.');
      const places = await loadPlaces(device);
      let out;
      try {
        out = await answer(text, b.context || {}, places);
      } catch (err) {
        console.error('assistant error:', err);
        out = { content: 'Something went wrong while I was working on that. Nothing was changed — please try again.', cards: [], actions: [], suggestions: [] };
      }
      const rows = [
        { device_id: device, role: 'user', content: text, payload: null },
        { device_id: device, role: 'assistant', content: out.content, payload: { cards: out.cards, actions: out.actions, suggestions: out.suggestions } },
      ];
      const { data, error } = await supabase.from('chat_messages').insert(rows).select();
      if (error) throw error;
      const sorted = (data || []).sort((x, y) => x.id - y.id).map(shape);
      return res.status(201).json({ messages: sorted });
    }
    if (req.method === 'DELETE') {
      const { error } = await supabase.from('chat_messages').delete().eq('device_id', device);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('chat error:', err);
    return fail(res, 500, err.message || 'Something went wrong');
  }
}
