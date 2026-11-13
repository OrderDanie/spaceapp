import type { Place } from "@/data/places";
import { metricValue, pct, targetOf, trendChange, validPoints, type Measurement, type TrendPoint } from "@/lib/spectral";

export interface Trend {
  points: TrendPoint[];
  first: TrendPoint | null;
  last: TrendPoint | null;
  prev: TrendPoint | null;
  /** % change across the record — three-year medians at each end when `smoothed`. */
  total: number | null;
  smoothed: boolean;
  /** % change, previous clear year → latest clear year. */
  yoy: number | null;
}

const EMPTY: Trend = { points: [], first: null, last: null, prev: null, total: null, smoothed: false, yoy: null };

/** Everything the UI needs to know about a place's measured record. */
export function trendOf(place: Place | null | undefined, rows: Measurement[] | undefined): Trend {
  if (!place || !rows?.length) return EMPTY;
  const points = validPoints(rows, place.target);
  if (!points.length) return EMPTY;
  const first = points[0];
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const fin = (v: number | null) => (v != null && Number.isFinite(v) ? v : null);
  const tc = trendChange(points);
  return { points, first, last, prev, total: tc ? fin(tc.pct) : null, smoothed: !!tc?.smoothed, yoy: prev ? fin(pct(prev.value, last.value)) : null };
}

/** Measured value for a given year, or null when that year is missing or too cloudy. */
export function valueInYear(place: Place, rows: Measurement[] | undefined, year: number): { value: number; date: string } | null {
  const row = rows?.find((r) => Number(r.date.slice(0, 4)) === year && (r.quality === "good" || r.quality === "fair"));
  if (!row) return null;
  const v = metricValue(row, place.target);
  return v == null ? null : { value: v, date: row.used_date };
}

/** Is a rise in this place's metric good news? */
export const goodWhenUp = (place: Place) => targetOf(place.target).goodWhenUp;

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
export const fmtNum = (v: number) => (Math.abs(v) < 100 ? nf1.format(v) : nf0.format(v));
