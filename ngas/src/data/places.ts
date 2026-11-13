import type { LayerId } from "@/lib/gibs";
import type { Measurement, TargetKey } from "@/lib/spectral";

export type Category = "Water" | "Forest" | "Fire" | "Flood" | "Wetland" | "Ice";
export type Status = "Critical" | "Watching" | "Recovering" | "Stable";

/** A tracked footprint on Earth. Rows live in the `places` table. */
export interface Place {
  id: string;
  name: string;
  region: string;
  category: Category;
  status: Status;
  lat: number;
  lon: number;
  /** Degrees of latitude the frame covers, top to bottom. */
  span: number;
  zoom: number;
  layer: LayerId;
  before: string;
  after: string;
  year_start: number;
  /** "MM-DD" — the calendar day sampled every year, so seasons line up. */
  month_day: string;
  /** What Epoch measures here. */
  target: TargetKey;
  headline: string;
  summary: string;
  color: string;
  /** Added by this browser rather than curated. */
  custom: boolean;
}

export type Severity = "critical" | "warning" | "info" | "good";

/** A statement about measured change. Rows live in the `alerts` table. */
export interface AlertRow {
  id: string;
  place_id: string;
  kind: "yoy" | "record" | "baseline";
  year: number;
  severity: Severity;
  title: string;
  body: string;
  created_at: string;
}

/** A live natural event from NASA EONET. */
export interface EarthEvent {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  date: string;
  updated: string | null;
  lat: number;
  lon: number;
  magnitude: number | null;
  unit: string | null;
  observations: number;
  source: string | null;
  link: string | null;
  distance?: number;
}

export interface Finding {
  id: number;
  place_id: string | null;
  place_name: string;
  lat: number;
  lon: number;
  span: number;
  date_a: string;
  date_b: string;
  target: string;
  headline: string;
  summary: string;
  created_at: string;
}

export interface SeriesState {
  rows: Measurement[];
  /** Years still to be measured. */
  missing: number;
  status: "idle" | "loading" | "ready" | "error";
}

export interface GeoResult {
  name: string;
  region: string;
  kind: string;
  water: boolean;
  ice: boolean;
  lat: number;
  lon: number;
  span: number;
}
