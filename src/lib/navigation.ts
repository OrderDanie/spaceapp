import { useEffect, useRef } from "react";
import { PLACES, placeById } from "@/data/places";
import { LAYERS, latestISO, type LayerId } from "@/lib/gibs";
import { useApp, type View } from "@/store";

const VIEWS: View[] = ["today", "explore", "compare", "timelapse", "places", "alerts"];
const VIEW_SET = new Set<string>(VIEWS);
const PLACE_SET = new Set(PLACES.map((p) => p.id));
const LAYER_SET = new Set<string>(LAYERS.map((l) => l.id));

interface Route {
  view: View;
  placeId?: string;
  date?: string;
  layer?: LayerId;
}

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = hash.split("?");
  const [rawView, rawPlace] = path.split("/").filter(Boolean);
  const view = VIEW_SET.has(rawView) ? (rawView as View) : "today";
  const params = new URLSearchParams(query);
  const date = params.get("date") ?? undefined;
  const rawLayer = params.get("layer") ?? undefined;
  return {
    view,
    placeId: rawPlace && PLACE_SET.has(rawPlace) ? rawPlace : undefined,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    layer: rawLayer && LAYER_SET.has(rawLayer) ? (rawLayer as LayerId) : undefined,
  };
}

function routeFor(state: ReturnType<typeof useApp.getState>) {
  const place = state.view === "explore" ? state.focusPlace : state.placeId;
  const includePlace = place && ["explore", "compare", "timelapse"].includes(state.view);
  let route = `#/${state.view}${includePlace ? `/${place}` : ""}`;
  if (state.view === "explore") {
    const params = new URLSearchParams();
    params.set("date", state.exploreDate);
    params.set("layer", state.layer);
    route += `?${params.toString()}`;
  }
  return route;
}

function titleFor(state: ReturnType<typeof useApp.getState>) {
  const place = state.view === "explore" ? state.focusPlace : state.placeId;
  const viewName = state.view.charAt(0).toUpperCase() + state.view.slice(1);
  return place && ["explore", "compare", "timelapse"].includes(state.view)
    ? `${placeById(place).name} · ${viewName} · Epoch`
    : `${viewName} · Epoch`;
}

/**
 * Synchronises the app shell with a compact hash route. Browser back/forward
 * now behaves like a native navigation stack, while high-frequency date and
 * layer changes replace the current history entry.
 */
export function useAppNavigation() {
  const applying = useRef(false);

  useEffect(() => {
    const apply = () => {
      const route = parseRoute();
      const current = useApp.getState();
      const placeId = route.placeId ?? current.placeId;
      const focusPlace = route.view === "explore" ? route.placeId ?? null : current.focusPlace;
      applying.current = true;
      useApp.setState({
        view: route.view,
        placeId,
        focusPlace,
        flyNonce: route.view === "explore" && route.placeId ? current.flyNonce + 1 : current.flyNonce,
        exploreDate: route.date ?? current.exploreDate ?? latestISO(),
        layer: route.layer ?? current.layer,
        paletteOpen: false,
        settingsOpen: false,
      });
      document.title = titleFor(useApp.getState());
      queueMicrotask(() => {
        applying.current = false;
      });
    };

    if (window.location.hash) apply();
    else window.history.replaceState({ epoch: true }, "", routeFor(useApp.getState()));

    const unsubscribe = useApp.subscribe((state, previous) => {
      document.title = titleFor(state);
      if (applying.current) return;
      const route = routeFor(state);
      if (window.location.hash === route) return;
      const placeChanged = state.view === "explore"
        ? state.focusPlace !== previous.focusPlace
        : state.placeId !== previous.placeId;
      const major = state.view !== previous.view || placeChanged;
      window.history[major ? "pushState" : "replaceState"]({ epoch: true }, "", route);
    });

    window.addEventListener("popstate", apply);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", apply);
    };
  }, []);
}

export const viewIndex = (view: View) => VIEWS.indexOf(view);