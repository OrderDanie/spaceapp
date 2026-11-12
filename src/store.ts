import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayerId } from "@/lib/gibs";
import { latestISO } from "@/lib/gibs";
import { ALERTS, PLACES } from "@/data/places";

export type View = "today" | "explore" | "compare" | "timelapse" | "places" | "alerts";

export type IslandTone = "blue" | "green" | "orange" | "red" | "purple" | "teal";
export type IslandIcon = "satellite" | "check" | "alert" | "download" | "bookmark" | "sparkles" | "layers" | "link";

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

export type MapCmd = "zoomIn" | "zoomOut" | "north" | "home" | "projection";

export interface Settings {
  autoRotate: boolean;
  showLabels: boolean;
  reduceMotion: boolean;
  hdImagery: boolean;
  notifyCritical: boolean;
  notifyDigest: boolean;
  units: "metric" | "imperial";
  /** On unless explicitly `false` (older saved settings have no key). */
  sounds?: boolean;
}

interface AppState {
  view: View;
  setView: (v: View) => void;

  placeId: string;
  focusPlace: string | null;
  selectPlace: (id: string, view?: View) => void;
  clearFocus: () => void;
  flyNonce: number;

  layer: LayerId;
  setLayer: (l: LayerId) => void;
  exploreDate: string;
  setExploreDate: (d: string) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
  paletteOpen: boolean;
  setPalette: (b: boolean) => void;
  settingsOpen: boolean;
  setSettings: (b: boolean) => void;
  welcomeSeen: boolean;
  completeWelcome: () => void;

  island: IslandEvent | null;
  notify: (e: Omit<IslandEvent, "id">) => void;
  clearIsland: (id?: number) => void;

  mapCmd: { kind: MapCmd; nonce: number } | null;
  sendMap: (kind: MapCmd) => void;

  watchlist: string[];
  toggleWatch: (id: string) => void;

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

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: "today",
      setView: (view) => set({ view }),

      placeId: "aral",
      focusPlace: null,
      flyNonce: 0,
      selectPlace: (id, view) =>
        set((s) => ({
          placeId: id,
          focusPlace: id,
          flyNonce: s.flyNonce + 1,
          view: view ?? s.view,
        })),
      clearFocus: () => set({ focusPlace: null }),

      layer: "viirs",
      setLayer: (layer) => set({ layer }),
      exploreDate: latestISO(),
      setExploreDate: (exploreDate) => set({ exploreDate }),

      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      paletteOpen: false,
      setPalette: (paletteOpen) => set({ paletteOpen }),
      settingsOpen: false,
      setSettings: (settingsOpen) => set({ settingsOpen }),
      welcomeSeen: false,
      completeWelcome: () => set({ welcomeSeen: true }),

      island: null,
      notify: (e) => set({ island: { ...e, id: islandSeq++ } }),
      clearIsland: (id) => {
        const cur = get().island;
        if (!cur || id === undefined || cur.id === id) set({ island: null });
      },

      mapCmd: null,
      sendMap: (kind) => set((s) => ({ mapCmd: { kind, nonce: (s.mapCmd?.nonce ?? 0) + 1 } })),

      watchlist: PLACES.slice(0, 5).map((p) => p.id),
      toggleWatch: (id) =>
        set((s) => ({
          watchlist: s.watchlist.includes(id) ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id],
        })),

      readAlerts: [],
      dismissed: [],
      markRead: (id) => set((s) => ({ readAlerts: s.readAlerts.includes(id) ? s.readAlerts : [...s.readAlerts, id] })),
      dismiss: (id) => set((s) => ({ dismissed: [...s.dismissed, id] })),
      restoreAlert: (id) => set((s) => ({ dismissed: s.dismissed.filter((x) => x !== id) })),
      markAllRead: () => set({ readAlerts: ALERTS.map((a) => a.id) }),
      restoreAlerts: () => set({ dismissed: [], readAlerts: [] }),

      settings: {
        autoRotate: true,
        showLabels: false,
        reduceMotion: false,
        hdImagery: true,
        notifyCritical: true,
        notifyDigest: false,
        units: "metric",
      },
      setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
    }),
    {
      name: "epoch-app-v1",
      partialize: (s) => ({
        watchlist: s.watchlist,
        settings: s.settings,
        readAlerts: s.readAlerts,
        dismissed: s.dismissed,
        sidebarOpen: s.sidebarOpen,
        layer: s.layer,
        welcomeSeen: s.welcomeSeen,
      }),
    }
  )
);

export const useUnreadCount = () =>
  useApp((s) => ALERTS.filter((a) => !s.readAlerts.includes(a.id) && !s.dismissed.includes(a.id)).length);
