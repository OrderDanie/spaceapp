import type { AlertRow, EarthEvent, Finding, GeoResult, Place } from "@/data/places";
import type { Measurement, Transitions } from "@/lib/spectral";

const DEVICE_KEY = "epoch-device";

/** Anonymous id for this browser. It scopes personal data server-side; it is not a login. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[a-zA-Z0-9-]{16,64}$/.test(id)) {
      id = crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anonymous-0000-0000";
  }
}

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function req<T>(path: string, init: RequestInit & { json?: unknown; timeout?: number } = {}): Promise<T> {
  const { json, timeout = 30000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: ctrl.signal,
      headers: { "X-Epoch-Device": deviceId(), ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    throw new ApiError(ctrl.signal.aborted ? "That took too long. Please try again." : navigator.onLine ? "Couldn’t reach Epoch’s server." : "You’re offline.", 0);
  } finally {
    window.clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(d.error || `Request failed (${res.status})`, res.status, d.fields);
  }
  return data as T;
}

export interface CompareResult {
  a: Measurement;
  b: Measurement;
  transitions: Transitions;
}

export interface ChatCard {
  type: "change" | "series" | "events" | "measure" | "ranking";
  [key: string]: unknown;
}
export interface ChatAction {
  type: "navigate" | "compare" | "flyTo" | "layer" | "watch" | "track";
  soft?: boolean;
  [key: string]: unknown;
}
export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  payload: { cards?: ChatCard[]; actions?: ChatAction[]; suggestions?: string[] } | null;
  created_at: string;
}

export interface UserStateDTO {
  watchlist: string[] | null;
  read_alerts: string[] | null;
  dismissed: string[] | null;
  settings: Record<string, unknown> | null;
}

export interface NewPlaceInput {
  name: string;
  region?: string;
  lat: number;
  lon: number;
  span: number;
  target: string;
}

const q = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export const api = {
  places: () => req<{ places: Place[] }>("/api/places").then((r) => r.places),
  searchPlaces: (term: string) => req<{ results: GeoResult[] }>(`/api/places?${q({ search: term })}`).then((r) => r.results),
  addPlace: (input: NewPlaceInput) => req<{ place: Place }>("/api/places", { method: "POST", json: input }).then((r) => r.place),
  removePlace: (id: string) => req<{ ok: true }>("/api/places", { method: "DELETE", json: { id } }),

  getState: () => req<{ state: UserStateDTO | null }>("/api/state").then((r) => r.state),
  putState: (patch: Partial<UserStateDTO>) => req<{ state: UserStateDTO }>("/api/state", { method: "PUT", json: patch }),

  allSeries: () => req<{ series: Record<string, Measurement[]> }>("/api/measure?all=1").then((r) => r.series),
  series: (placeId: string) => req<{ rows: Measurement[]; missing: string[] }>(`/api/measure?${q({ placeId, series: 1 })}`),
  measure: (placeId: string, date: string, best = true) =>
    req<{ measurement: Measurement }>(`/api/measure?${q({ placeId, date, best: best ? 1 : undefined })}`, { timeout: 60000 }).then((r) => r.measurement),
  compare: (placeId: string, a: string, b: string) => req<CompareResult>(`/api/measure?${q({ placeId, a, b })}`, { timeout: 45000 }),

  alerts: () => req<{ alerts: AlertRow[] }>("/api/alerts").then((r) => r.alerts),
  evaluate: (placeId: string) => req<{ alerts: AlertRow[]; evaluated: number }>("/api/alerts", { method: "POST", json: { placeId } }),

  events: () => req<{ events: EarthEvent[]; fetched_at: string }>("/api/events"),

  chatHistory: () => req<{ messages: ChatMessage[] }>("/api/chat").then((r) => r.messages),
  chatSend: (text: string, context: Record<string, unknown>) =>
    req<{ messages: ChatMessage[] }>("/api/chat", { method: "POST", json: { text, context }, timeout: 60000 }).then((r) => r.messages),
  chatClear: () => req<{ ok: true }>("/api/chat", { method: "DELETE" }),

  findings: () => req<{ findings: Finding[] }>("/api/findings").then((r) => r.findings),
  saveFinding: (f: Omit<Finding, "id" | "created_at"> & { result?: unknown }) => req<{ finding: Finding }>("/api/findings", { method: "POST", json: f }).then((r) => r.finding),
  removeFinding: (id: number) => req<{ ok: true }>("/api/findings", { method: "DELETE", json: { id } }),
};
