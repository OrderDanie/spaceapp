/** Shared request helpers for the API routes. */
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Epoch-Device');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Anonymous per-browser id. It scopes personal data; it is not authentication. */
export function deviceOf(req) {
  const d = String(req.headers['x-epoch-device'] || '').trim();
  return /^[a-zA-Z0-9-]{16,64}$/.test(d) ? d : null;
}

export function bodyOf(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b;
}

export const fail = (res, status, error) => res.status(status).json({ error });

export const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const toISO = (d) => d.toISOString().slice(0, 10);
export const addDays = (iso, n) => toISO(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000));
/** Yesterday (UTC) — the newest day with a complete global mosaic. */
export const latestISO = () => addDays(toISO(new Date()), -1);
export const clampDate = (iso, min, max) => (iso < min ? min : iso > max ? max : iso);
