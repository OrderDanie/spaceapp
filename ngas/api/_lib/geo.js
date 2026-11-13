/** Place-name lookup (OpenStreetMap via Photon, Open-Meteo as a fallback). */

const KIND = {
  lake: 'Lake', reservoir: 'Reservoir', glacier: 'Glacier', river: 'River', bay: 'Bay', sea: 'Sea', wetland: 'Wetland',
  city: 'City', town: 'Town', village: 'Village', island: 'Island', peak: 'Mountain', volcano: 'Volcano', forest: 'Forest',
  wood: 'Forest', desert: 'Desert', state: 'Region', country: 'Country', county: 'Region', national_park: 'Park', nature_reserve: 'Reserve',
};

function spanFromExtent(extent, lat) {
  if (!extent || extent.length !== 4) return null;
  const [w, n, e, s] = extent;
  const latSpan = Math.abs(n - s);
  const lonSpan = Math.abs(e - w) * Math.cos((lat * Math.PI) / 180);
  // The stage is 1.6 : 1, so a wide feature needs less latitude than its width.
  const need = Math.max(latSpan, lonSpan / 1.6) * 1.45;
  return Math.min(10, Math.max(0.35, Math.round(need * 100) / 100));
}

async function photon(q, limit) {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit * 2}&lang=en`, {
    signal: AbortSignal.timeout(6000),
    headers: { 'User-Agent': 'Epoch/1.0 (satellite change tracker)' },
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const json = await res.json();
  const out = [];
  for (const f of json.features || []) {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    if (typeof lat !== 'number' || typeof lon !== 'number' || !p.name) continue;
    if (Math.abs(lat) > 84) continue;
    // Streets, shops and buildings are far below what a 250 m sensor can see.
    if (['highway', 'shop', 'amenity', 'building', 'tourism', 'office', 'leisure', 'railway', 'craft'].includes(p.osm_key)) continue;
    if (p.osm_value === 'pond') continue;
    const span = spanFromExtent(p.extent, lat);
    out.push({
      name: p.name,
      region: [p.state, p.country].filter(Boolean).join(', ') || 'Earth',
      kind: KIND[p.osm_value] || (p.osm_key === 'water' ? 'Water' : p.osm_key === 'natural' ? 'Natural feature' : 'Place'),
      water: p.osm_key === 'water' || ['bay', 'sea', 'wetland', 'reservoir', 'water'].includes(p.osm_value),
      ice: p.osm_value === 'glacier',
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      span: span || (['city', 'town', 'village'].includes(p.osm_value) ? 0.6 : 1.5),
    });
  }
  // Same name twice at nearly the same spot is noise.
  const seen = new Set();
  return out
    .filter((r) => {
      const k = `${r.name}|${Math.round(r.lat)}|${Math.round(r.lon)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

async function openMeteo(q, limit) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${limit}&language=en&format=json`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const json = await res.json();
  return (json.results || []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', ') || 'Earth',
    kind: r.feature_code?.startsWith('PPL') ? 'City' : r.feature_code === 'GLCR' ? 'Glacier' : r.feature_code === 'LK' ? 'Lake' : 'Place',
    water: r.feature_code === 'LK',
    ice: r.feature_code === 'GLCR',
    lat: Math.round(r.latitude * 1e4) / 1e4,
    lon: Math.round(r.longitude * 1e4) / 1e4,
    span: r.feature_code?.startsWith('PPL') ? 0.6 : 1.5,
  }));
}

export async function geocode(q, limit = 5) {
  const query = String(q || '').trim().slice(0, 80);
  if (query.length < 2) return [];
  // "12.5, 44.1" — raw coordinates are welcome too.
  const m = query.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) <= 84 && Math.abs(lon) <= 180) {
      return [{ name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, region: 'Coordinates', kind: 'Pin', water: false, ice: false, lat, lon, span: 1.5 }];
    }
  }
  try {
    const a = await photon(query, limit);
    if (a.length) return a;
  } catch {
    /* fall through */
  }
  try {
    return await openMeteo(query, limit);
  } catch {
    return [];
  }
}
