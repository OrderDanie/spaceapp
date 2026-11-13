export const ENGINE: string;
export const ANALYSIS_LAYER: string;
export const TRUE_COLOR_LAYER: string;
export const ANALYSIS_MIN_DATE: string;
export const ANALYSIS_SIZE: [number, number];

export const NODATA: 0;
export const WATER: 1;
export const FOREST: 2;
export const VEGETATION: 3;
export const BARE: 4;
export const SNOW: 5;
export const CLOUD: 6;
export const BURN: 7;

export type ClassKey = "nodata" | "water" | "forest" | "vegetation" | "bare" | "snow" | "cloud" | "burn";
export interface SurfaceClass {
  id: number;
  key: ClassKey;
  label: string;
  color: [number, number, number];
}
export const CLASSES: SurfaceClass[];
export const SURFACE_KEYS: ClassKey[];
export function classByKey(key: string): SurfaceClass;

export interface Stats {
  engine: string;
  width: number;
  height: number;
  total_km2: number;
  clear_km2: number;
  nodata_pct: number;
  cloud_pct: number;
  ndvi: number | null;
  water_km2: number;
  forest_km2: number;
  vegetation_km2: number;
  bare_km2: number;
  snow_km2: number;
  burn_km2: number;
  date?: string;
}
export type Quality = "good" | "fair" | "poor" | "none";
export interface Measurement extends Stats {
  date: string;
  used_date: string;
  best: boolean;
  quality: Quality;
}
export interface Transitions {
  water_lost: number;
  water_gained: number;
  forest_lost: number;
  vegetation_lost: number;
  greener: number;
  burned: number;
  snow_lost: number;
  snow_gained: number;
  comparable: number;
  changed: number;
}
export interface Geo {
  lat: number;
  span: number;
}

export function classifyPixel(swir: number, nir: number, red: number, gap?: boolean): number;
export function darkShare(data: ArrayLike<number>, width: number, height: number): number;
export function classifyImage(
  data: ArrayLike<number>,
  width: number,
  height: number,
  geo: Geo,
  trueColor?: ArrayLike<number> | null
): { stats: Stats; labels: Uint8Array };
export function quality(stats: Partial<Stats> | null | undefined): Quality;
export function diffLabels(a: Uint8Array, b: Uint8Array, width: number, height: number, geo: Geo): { transitions: Transitions; change: Uint8Array };

export interface ChangeKind {
  key: keyof Transitions;
  label: string;
  color: [number, number, number];
}
export const CHANGES: (ChangeKind | null)[];

export function bboxFor(lat: number, lon: number, span: number, aspect: number): [number, number, number, number];
export function analysisUrl(lat: number, lon: number, span: number, date: string, size?: [number, number], layer?: string): string;
export function gapCheckUrl(lat: number, lon: number, span: number, date: string, size?: [number, number]): string;

export type TargetKey = "water" | "flood" | "forest" | "vegetation" | "snow" | "burn";
export interface Target {
  key: TargetKey;
  label: string;
  short: string;
  unit: string;
  goodWhenUp: boolean;
  color: string;
}
export const TARGETS: Record<TargetKey, Target>;
export function targetOf(key: string | null | undefined): Target;
export function metricValue(stats: Partial<Stats> | null | undefined, target: string): number | null;

export interface TrendPoint {
  year: number;
  date: string;
  value: number;
  quality: Quality;
}
export function validPoints(rows: Measurement[] | null | undefined, target: string): TrendPoint[];
export function trendChange(points: TrendPoint[] | null | undefined): { from: number; to: number; pct: number | null; smoothed: boolean } | null;
export function pct(from: number | null | undefined, to: number | null | undefined): number | null;
export function fmtKm2(v: number | null | undefined): string;
export function fmtPct(v: number | null | undefined): string;
export function fmtDay(iso: string): string;
export function narrate(input: {
  name: string;
  target: string;
  a: Measurement;
  b: Measurement;
  transitions?: Transitions | null;
}): { headline: string; lines: string[]; delta: number | null };
