import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayerId } from "@/lib/gibs";
import { latestISO } from "@/lib/gibs";
import type { AlertRow, EarthEvent, Finding, Place, SeriesState } from "@/data/places";
import { api, type NewPlaceInput } from "@/lib/api";
import { ANALYSIS_MIN_DATE, type Measurement } from "@/lib/spectral";
import type { CompareMode } from "@/components/CompareStage";

export type View = "today" | "explore" | "compare" | "timelapse" | "places" | "alerts";

export type IslandTone = "blue" | "green" | "orange" | "red" | "purple" | "teal";
export type IslandIcon = "satellite" | "check" | "alert" | "download" | "bookmark" | "sparkles" | "layers" | "link" | "pin";

export interface IslandEvent {
  id: number;
  title: string;
  subtitle?: string;
  icon?: IslandIcon;
  tone?: IslandTone;
  progress?: boolean;
  duration?: number;
  actionLabel?: string;
  action?: () => void;
}

export type MapCmd = "zoomIn" | "zoomOut" | "home" | "north" | "projection";

export interface Settings {
  autoRotate: boolean;
  showLabels: boolean;
  reduceMotion: boolean;
  hdImagery: boolean;
  sounds: boolean;
  /** Hover, scroll and drag sounds. */
  moveSounds: boolean;
  haptics: boolean;
  /** Announce unread measured changes when the app opens. */
  announceAlerts: boolean;
  /** Show NASA EONET natural events on the globe. */
  showEvents: boolean;
  /** Glass edges bend what is behind them (Chromium browsers only). */
  refraction: boolean;
  /** Flat (Mercator) map instead of the 3D globe. */
  flatMap: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  autoRotate: true,
  showLabels: false,
  reduceMotion: false,
  hdImagery: true,
  sounds: true,
  moveSounds: true,
  haptics: true,
  announceAlerts: true,
  showEvents: true,
  refraction: true,
  flatMap: false,
};

/** A spot on the globe that is not (yet) a tracked place. */
export interface Pin {
  lat: number;
  lon: number;
  name?: string;
  region?: string;
  span?: number;
  zoom?: number;
  event?: EarthEvent;
}

export interface CompareState {
  before: string;
  after: string;
  layer: LayerId;
  mode: CompareMode;
}

export interface AddPlaceDraft {
  name?: string;
  region?: string;
  lat?: number;
  lon?: number;
  span?: number;
  target?: string;
}

type Load = "idle" | "loading" | "ready" | "error";

interface AppState {
  boot: "loading" | "ready" | "error";
  bootStep: number;
  bootError: string | null;
  bootstrap: () => Promise<void>;

  places: Place[];
  series: Record<string, SeriesState>;
  ensureSeries: (id: string) => Promise<void>;
  createPlace: (input: NewPlaceInput) => Promise<Place>;
  deletePlace: (id: string) => Promise<void>;

  alerts: AlertRow[];
  alertsStatus: Load;
  loadAlerts: () => Promise<void>;

  events: EarthEvent[];
  eventsStatus: Load;
  eventsAt: string | null;
  loadEvents: (force?: boolean) => Promise<void>;

  findings: Finding[];
  findingsStatus: Load;
  loadFindings: () => Promise<void>;
  setFindings: (f: Finding[]) => void;

  view: View;
  setView: (v: View) => void;

  placeId: string;
  focusPlace: string | null;
  selectPlace: (id: string, view?: View) => void;
  clearFocus: () => void;
  flyNonce: number;
  pin: Pin | null;
  setPin: (pin: Pin | null, fly?: boolean) => void;

  layer: LayerId;
  setLayer: (l: LayerId) => void;
  exploreDate: string;
  setExploreDate: (d: string) => void;

  compare: CompareState;
  setCompare: (patch: Partial<CompareState>) => void;
  openCompare: (placeId: string, a: string, b: string) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
  paletteOpen: boolean;
  setPalette: (b: boolean) => void;
  settingsOpen: boolean;
  setSettings: (b: boolean) => void;
  welcomeSeen: boolean;
  completeWelcome: () => void;

  analystOpen: boolean;
  /** A question to ask as soon as the analyst opens. */
  analystSeed: { text: string; nonce: number } | null;
  setAnalyst: (open: boolean, seed?: string) => void;

  addPlace: AddPlaceDraft | null;
  setAddPlace: (draft: AddPlaceDraft | null) => void;

  island: IslandEvent | null;
  notify: (e: Omit<IslandEvent, "id">) => void;
  clearIsland: (id?: number) => void;

  mapCmd: { kind: MapCmd; nonce: number } | null;
  sendMap: (kind: MapCmd) => void;

  watchlist: string[];
  watchInit: boolean;
  toggleWatch: (id: string) => void;
  setWatch: (id: string, on: boolean) => void;

  readAlerts: string[];
  dismissed: string[];
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  restoreAlert: (id: string) => void;
  markAllRead: () => void;
  restoreAlerts: () => void;

  settings: Settings;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

let islandSeq = 1;
const seriesInFlight = new Set<string>();

/** The yearly sample days for a place's trend — the same calendar day every year. */
export function seriesDates(place: Place): string[] {
  const max = latestISO();
  const out: string[] = [];
  for (let y = place.year_start; y <= Number(max.slice(0, 4)); y++) {
    const d = `${y}-${place.month_day}`;
    if (d >= ANALYSIS_MIN_DATE && d <= max) out.push(d);
  }
  return out;
}

const byDate = (a: Measurement, b: Measurement) => (a.date < b.date ? -1 : 1);

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      boot: "loading",
      bootStep: 0,
      bootError: null,
      bootstrap: async () => {
        set({ boot: "loading", bootError: null, bootStep: 0 });
        try {
          const step = <T,>(p: Promise<T>) =>
            p.then((v) => {
              set((s) => ({ bootStep: s.bootStep + 1 }));
              return v;
            });
          const [places, allSeries, remote] = await Promise.all([step(api.places()), step(api.allSeries()), step(api.getState().catch(() => null))]);
          if (!places.length) throw new Error("The places table is empty.");
          const ids = new Set(places.map((p) => p.id));
          const series: Record<string, SeriesState> = {};
          for (const p of places) {
            const rows = allSeries[p.id] ?? [];
            const missing = Math.max(0, seriesDates(p).length - rows.length);
            series[p.id] = { rows, missing, status: missing ? "idle" : "ready" };
          }
          const s = get();
          let watchlist = s.watchlist;
          let readAlerts = s.readAlerts;
          let dismissed = s.dismissed;
          let settings = s.settings;
          if (remote) {
            // The database is the source of truth; localStorage is only a fast first paint.
            if (Array.isArray(remote.watchlist)) watchlist = remote.watchlist;
            if (Array.isArray(remote.read_alerts)) readAlerts = remote.read_alerts;
            if (Array.isArray(remote.dismissed)) dismissed = remote.dismissed;
            if (remote.settings) settings = { ...DEFAULT_SETTINGS, ...settings, ...(remote.settings as Partial<Settings>) };
          } else if (!s.watchInit) {
            watchlist = places.filter((p) => !p.custom).slice(0, 5).map((p) => p.id);
          }
          watchlist = watchlist.filter((id) => ids.has(id));
          const placeId = ids.has(s.placeId) ? s.placeId : places[0].id;
          const place = places.find((p) => p.id === placeId)!;
          set({
            places,
            series,
            watchlist,
            watchInit: true,
            readAlerts,
            dismissed,
            settings,
            placeId,
            focusPlace: s.focusPlace && ids.has(s.focusPlace) ? s.focusPlace : null,
            compare: { before: place.before, after: place.after, layer: place.layer, mode: s.compare.mode },
            boot: "ready",
          });
          if (!remote) void api.putState({ watchlist, read_alerts: readAlerts, dismissed, settings: settings as unknown as Record<string, unknown> }).catch(() => {});
          void get().loadAlerts();
          void get().loadEvents();
          void get().loadFindings();
        } catch (err) {
          set({ boot: "error", bootError: err instanceof Error ? err.message : "Unknown error" });
        }
      },

      places: [],
      series: {},
      ensureSeries: async (id) => {
        const place = get().places.find((p) => p.id === id);
        const cur = get().series[id];
        if (!place || seriesInFlight.has(id) || cur?.status === "ready") return;
        seriesInFlight.add(id);
        const patch = (fn: (s: SeriesState) => SeriesState) =>
          set((s) => ({ series: { ...s.series, [id]: fn(s.series[id] ?? { rows: [], missing: 0, status: "idle" }) } }));
        try {
          const have = new Set((cur?.rows ?? []).map((r) => r.date));
          const todo = seriesDates(place).filter((d) => !have.has(d));
          // Newest first: the latest reading is what most screens show.
          todo.reverse();
          patch((s) => ({ ...s, missing: todo.length, status: todo.length ? "loading" : "ready" }));
          if (!todo.length) return;
          let i = 0;
          let failed = 0;
          const worker = async () => {
            while (i < todo.length) {
              const date = todo[i++];
              if (!get().places.some((p) => p.id === id)) return; // place was removed meanwhile
              try {
                const m = await api.measure(id, date, true);
                patch((s) => ({ ...s, rows: [...s.rows.filter((r) => r.date !== m.date), m].sort(byDate), missing: Math.max(0, s.missing - 1) }));
              } catch {
                failed++;
                patch((s) => ({ ...s, missing: Math.max(0, s.missing - 1) }));
              }
            }
          };
          await Promise.all([worker(), worker()]);
          patch((s) => ({ ...s, missing: 0, status: failed === todo.length ? "error" : "ready" }));
          if (failed < todo.length) {
            // New measurements can imply new alerts — let the server re-read the trend.
            await api.evaluate(id).catch(() => null);
            void get().loadAlerts();
          }
        } finally {
          seriesInFlight.delete(id);
        }
      },
      createPlace: async (input) => {
        const place = await api.addPlace(input);
        set((s) => ({
          places: [...s.places, place],
          series: { ...s.series, [place.id]: { rows: [], missing: seriesDates(place).length, status: "idle" } },
          watchlist: s.watchlist.includes(place.id) ? s.watchlist : [...s.watchlist, place.id],
        }));
        void get().ensureSeries(place.id);
        return place;
      },
      deletePlace: async (id) => {
        await api.removePlace(id);
        set((s) => {
          const places = s.places.filter((p) => p.id !== id);
          const series = { ...s.series };
          delete series[id];
          const fallback = places[0];
          const lost = s.placeId === id;
          return {
            places,
            series,
            watchlist: s.watchlist.filter((x) => x !== id),
            alerts: s.alerts.filter((a) => a.place_id !== id),
            placeId: lost ? fallback.id : s.placeId,
            focusPlace: s.focusPlace === id ? null : s.focusPlace,
            compare: lost ? { ...s.compare, before: fallback.before, after: fallback.after, layer: fallback.layer } : s.compare,
          };
        });
      },

      alerts: [],
      alertsStatus: "idle",
      loadAlerts: async () => {
        set((s) => ({ alertsStatus: s.alerts.length ? s.alertsStatus : "loading" }));
        try {
          set({ alerts: await api.alerts(), alertsStatus: "ready" });
        } catch {
          set((s) => ({ alertsStatus: s.alerts.length ? "ready" : "error" }));
        }
      },

      events: [],
      eventsStatus: "idle",
      eventsAt: null,
      loadEvents: async (force) => {
        const s = get();
        if (s.eventsStatus === "loading") return;
        if (!force && s.eventsAt && Date.now() - Date.parse(s.eventsAt) < 5 * 60 * 1000) return;
        set({ eventsStatus: s.events.length ? "ready" : "loading" });
        try {
          const r = await api.events();
          set({ events: r.events, eventsAt: r.fetched_at, eventsStatus: "ready" });
        } catch {
          set((st) => ({ eventsStatus: st.events.length ? "ready" : "error" }));
        }
      },

      findings: [],
      findingsStatus: "idle",
      loadFindings: async () => {
        set({ findingsStatus: "loading" });
        try {
          set({ findings: await api.findings(), findingsStatus: "ready" });
        } catch {
          set({ findingsStatus: "error" });
        }
      },
      setFindings: (findings) => set({ findings }),

      view: "today",
      setView: (view) => set({ view }),

      placeId: "",
      focusPlace: null,
      flyNonce: 0,
      selectPlace: (id, view) =>
        set((s) => {
          const p = s.places.find((x) => x.id === id);
          if (!p) return {};
          return {
            placeId: id,
            focusPlace: id,
            pin: null,
            flyNonce: s.flyNonce + 1,
            view: view ?? s.view,
            compare: id === s.placeId ? s.compare : { ...s.compare, before: p.before, after: p.after, layer: p.layer },
          };
        }),
      clearFocus: () => set({ focusPlace: null, pin: null }),
      pin: null,
      setPin: (pin, fly = true) => set((s) => ({ pin, focusPlace: pin ? null : s.focusPlace, flyNonce: pin && fly ? s.flyNonce + 1 : s.flyNonce })),

      layer: "viirs",
      setLayer: (layer) => set({ layer }),
      exploreDate: latestISO(),
      setExploreDate: (exploreDate) => set({ exploreDate }),

      compare: { before: "2000-08-25", after: latestISO(), layer: "truecolor", mode: "swipe" },
      setCompare: (patch) => set((s) => ({ compare: { ...s.compare, ...patch } })),
      openCompare: (placeId, a, b) =>
        set((s) => {
          const p = s.places.find((x) => x.id === placeId);
          if (!p) return {};
          const [before, after] = a <= b ? [a, b] : [b, a];
          return { placeId, focusPlace: placeId, pin: null, view: "compare", compare: { ...s.compare, before, after, layer: placeId === s.placeId ? s.compare.layer : p.layer } };
        }),

      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      paletteOpen: false,
      setPalette: (paletteOpen) => set({ paletteOpen }),
      settingsOpen: false,
      setSettings: (settingsOpen) => set({ settingsOpen }),
      welcomeSeen: false,
      completeWelcome: () => set({ welcomeSeen: true }),

      analystOpen: false,
      analystSeed: null,
      setAnalyst: (open, seed) =>
        set((s) => ({ analystOpen: open, analystSeed: seed ? { text: seed, nonce: (s.analystSeed?.nonce ?? 0) + 1 } : s.analystSeed, paletteOpen: false })),

      addPlace: null,
      setAddPlace: (addPlace) => set({ addPlace }),

      island: null,
      notify: (e) => set({ island: { ...e, id: islandSeq++ } }),
      clearIsland: (id) => {
        const cur = get().island;
        if (!cur || id === undefined || cur.id === id) set({ island: null });
      },

      mapCmd: null,
      sendMap: (kind) => set((s) => ({ mapCmd: { kind, nonce: (s.mapCmd?.nonce ?? 0) + 1 } })),

      watchlist: [],
      watchInit: false,
      toggleWatch: (id) =>
        set((s) => ({ watchlist: s.watchlist.includes(id) ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id] })),
      setWatch: (id, on) =>
        set((s) => ({ watchlist: on ? (s.watchlist.includes(id) ? s.watchlist : [...s.watchlist, id]) : s.watchlist.filter((x) => x !== id) })),

      readAlerts: [],
      dismissed: [],
      markRead: (id) => set((s) => ({ readAlerts: s.readAlerts.includes(id) ? s.readAlerts : [...s.readAlerts, id] })),
      dismiss: (id) => set((s) => ({ dismissed: s.dismissed.includes(id) ? s.dismissed : [...s.dismissed, id] })),
      restoreAlert: (id) => set((s) => ({ dismissed: s.dismissed.filter((x) => x !== id) })),
      markAllRead: () => set((s) => ({ readAlerts: [...new Set([...s.readAlerts, ...s.alerts.map((a) => a.id)])] })),
      restoreAlerts: () => set({ dismissed: [], readAlerts: [] }),

      settings: DEFAULT_SETTINGS,
      setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
    }),
    {
      name: "epoch-app-v2",
      partialize: (s) => ({
        watchlist: s.watchlist,
        watchInit: s.watchInit,
        settings: s.settings,
        readAlerts: s.readAlerts,
        dismissed: s.dismissed,
        sidebarOpen: s.sidebarOpen,
        layer: s.layer,
        welcomeSeen: s.welcomeSeen,
        placeId: s.placeId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
      },
    }
  )
);

/* ------------------------- database sync (debounced) ------------------------- */
let syncTimer = 0;
useApp.subscribe((s, prev) => {
  if (s.boot !== "ready" || prev.boot !== "ready") return;
  if (s.watchlist === prev.watchlist && s.readAlerts === prev.readAlerts && s.dismissed === prev.dismissed && s.settings === prev.settings) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    const now = useApp.getState();
    void api
      .putState({ watchlist: now.watchlist, read_alerts: now.readAlerts, dismissed: now.dismissed, settings: now.settings as unknown as Record<string, unknown> })
      .catch(() => {});
  }, 700);
});

/* --------------------------------- selectors --------------------------------- */
const PLACEHOLDER: Place = {
  id: "",
  name: "Earth",
  region: "",
  category: "Water",
  status: "Stable",
  lat: 20,
  lon: 0,
  span: 4,
  zoom: 4,
  layer: "truecolor",
  before: "2001-08-15",
  after: latestISO(),
  year_start: 2001,
  month_day: "08-15",
  target: "water",
  headline: "",
  summary: "",
  color: "#64d2ff",
  custom: false,
};

/** Non-reactive lookup for event handlers. Components should prefer `usePlace`. */
export const placeById = (id: string | null | undefined): Place => {
  const { places } = useApp.getState();
  return places.find((p) => p.id === id) ?? places[0] ?? PLACEHOLDER;
};

export const usePlace = (id: string | null | undefined): Place => useApp((s) => s.places.find((p) => p.id === id) ?? s.places[0] ?? PLACEHOLDER);

export const useSeries = (id: string | null | undefined): SeriesState | undefined => useApp((s) => (id ? s.series[id] : undefined));

export const useUnreadCount = () => useApp((s) => s.alerts.reduce((n, a) => n + (!s.readAlerts.includes(a.id) && !s.dismissed.includes(a.id) ? 1 : 0), 0));
