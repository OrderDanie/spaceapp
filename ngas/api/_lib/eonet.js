/** NASA EONET (Earth Observatory Natural Event Tracker) — live natural events. */

export const EVENT_CATEGORIES = {
  wildfires: 'Wildfire',
  severeStorms: 'Severe storm',
  volcanoes: 'Volcano',
  seaLakeIce: 'Iceberg / sea ice',
  floods: 'Flood',
  drought: 'Drought',
  dustHaze: 'Dust & haze',
  landslides: 'Landslide',
  earthquakes: 'Earthquake',
  snow: 'Snow',
  tempExtremes: 'Temperature extreme',
  waterColor: 'Water colour',
  manmade: 'Human-made',
};

function centre(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates;
  // Polygons: average the outer ring.
  const ring = geom.coordinates?.[0];
  if (!Array.isArray(ring) || !ring.length) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

let memo = { at: 0, key: '', events: [] };

export async function fetchEvents({ days = 30, category } = {}) {
  const d = Math.min(120, Math.max(1, Number(days) || 30));
  const key = `${d}`;
  if (memo.key !== key || Date.now() - memo.at > 5 * 60 * 1000) {
    const res = await fetch(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=${d}&limit=300`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`NASA EONET answered ${res.status}`);
    const json = await res.json();
    const events = [];
    for (const e of json.events || []) {
      const last = e.geometry?.[e.geometry.length - 1];
      const c = centre(last);
      if (!c) continue;
      const cat = e.categories?.[0]?.id || 'other';
      events.push({
        id: e.id,
        title: String(e.title || '').replace(/^(Wildfire|Prescribed Fire|Tropical Storm|Tropical Cyclone|Iceberg)\s+/i, (m) => m).trim(),
        category: cat,
        categoryLabel: EVENT_CATEGORIES[cat] || e.categories?.[0]?.title || 'Event',
        date: String(last.date || '').slice(0, 10),
        updated: last.date || null,
        lon: Math.round(c[0] * 1e4) / 1e4,
        lat: Math.round(c[1] * 1e4) / 1e4,
        magnitude: typeof last.magnitudeValue === 'number' ? last.magnitudeValue : null,
        unit: last.magnitudeUnit || null,
        observations: e.geometry.length,
        source: e.sources?.[0]?.id || null,
        link: e.sources?.[0]?.url || e.link || null,
      });
    }
    events.sort((a, b) => (a.updated < b.updated ? 1 : -1));
    memo = { at: Date.now(), key, events };
  }
  return category ? memo.events.filter((e) => e.category === category) : memo.events;
}
