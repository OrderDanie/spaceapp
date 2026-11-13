import supabase from '../db-client.js';
import { fmtDay, fmtKm2, fmtPct, pct, targetOf, trendChange, validPoints } from './spectral.js';

export { validPoints };

/**
 * Turn a measured trend into alerts. Nothing here is scripted: every alert is
 * a statement about two or more measurements stored in the database.
 */
export function evaluate(place, rows) {
  const t = targetOf(place.target);
  const pts = validPoints(rows, place.target);
  if (pts.length < 3) return [];
  const latest = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const first = pts[0];
  const out = [];
  const floor = 4; // km² — ignore movements smaller than a handful of pixels
  const tone = (up, big) => (up === t.goodWhenUp ? 'good' : big ? 'critical' : 'warning');

  const yoy = pct(prev.value, latest.value);
  // A swing this large in one year is as likely to be haze or sun-glint in a
  // single scene as a real change, so it is reported as something to check.
  const suspect = yoy != null && Math.abs(yoy) >= 60;
  if (suspect && Math.abs(latest.value - prev.value) >= floor) {
    out.push({
      id: `${place.id}:yoy:${latest.year}`,
      place_id: place.id,
      kind: 'yoy',
      year: latest.year,
      severity: 'info',
      title: `Unconfirmed jump: ${t.short} ${fmtPct(yoy)} since ${prev.year}`,
      body: `${fmtKm2(prev.value)} on ${fmtDay(prev.date)} → ${fmtKm2(latest.value)} on ${fmtDay(latest.date)}. One-year swings this large can be haze or sun-glint in a single scene — open the two images before trusting it.`,
    });
  } else if (yoy != null && Math.abs(yoy) >= 8 && Math.abs(latest.value - prev.value) >= floor) {
    const up = yoy > 0;
    out.push({
      id: `${place.id}:yoy:${latest.year}`,
      place_id: place.id,
      kind: 'yoy',
      year: latest.year,
      severity: tone(up, Math.abs(yoy) >= 25),
      title: `${t.label} ${up ? 'up' : 'down'} ${fmtPct(Math.abs(yoy)).replace('+', '')} since ${prev.year}`,
      body: `${fmtKm2(prev.value)} on ${fmtDay(prev.date)} → ${fmtKm2(latest.value)} on ${fmtDay(latest.date)}.`,
    });
  }

  if (pts.length >= 8 && !suspect) {
    const values = pts.map((p) => p.value);
    const isMin = latest.value <= Math.min(...values);
    const isMax = latest.value >= Math.max(...values);
    if ((isMin || isMax) && Math.max(...values) - Math.min(...values) >= floor) {
      out.push({
        id: `${place.id}:record:${latest.year}`,
        place_id: place.id,
        kind: 'record',
        year: latest.year,
        severity: tone(isMax, true),
        title: `${isMin ? 'Lowest' : 'Highest'} ${t.short} in ${pts.length} years of measurements`,
        body: `${fmtKm2(latest.value)} on ${fmtDay(latest.date)} — the ${isMin ? 'smallest' : 'largest'} extent Epoch has measured here since ${first.year}.`,
      });
    }
  }

  // Long-run change uses three-year medians at each end, so one odd scene cannot drive it.
  const tc = trendChange(pts);
  const base = tc ? tc.pct : null;
  if (base != null && Math.abs(base) >= 25 && Math.abs(tc.to - tc.from) >= floor && latest.year - first.year >= 3) {
    const up = base > 0;
    out.push({
      id: `${place.id}:baseline:${latest.year}`,
      place_id: place.id,
      kind: 'baseline',
      year: latest.year,
      severity: up === t.goodWhenUp ? 'good' : Math.abs(base) >= 50 ? 'critical' : 'warning',
      title: `${fmtPct(base)} ${t.short} since ${first.year}`,
      body: tc.smoothed
        ? `From about ${fmtKm2(tc.from)} (median of the first three clear years) to ${fmtKm2(tc.to)} (median of the latest three), measured from MODIS imagery.`
        : `From ${fmtKm2(first.value)} (${first.year}) to ${fmtKm2(latest.value)} (${latest.year}), measured from MODIS imagery.`,
    });
  }
  return out;
}

/** Store newly detected alerts; ones already known keep their original time. */
export async function saveAlerts(alerts) {
  if (!alerts.length) return;
  const { error } = await supabase.from('alerts').upsert(alerts, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
