import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker as MLMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, RotateCcw } from "lucide-react";
import { cn } from "@/utils/cn";
import { placeById, useApp } from "@/store";
import { layerById, type LayerId } from "@/lib/gibs";
import { BASE_MAXZOOM, BASE_TILES, filledTileUrls, polarFills, registerGapFill, type PolarFill } from "@/lib/gapfill";
import { sfx } from "@/lib/sound";


interface Telemetry {
  bearing: number;
  zoom: number;
  globe: boolean;
  loading: boolean;
  ready: boolean;
  failed: boolean;
  recovering: boolean;
  /** Older sunlit imagery currently standing in for a pole in darkness. */
  fills: PolarFill[];
}
export const useMapTelemetry = create<Telemetry>(() => ({
  bearing: 0,
  zoom: 1.7,
  globe: true,
  loading: false,
  ready: false,
  failed: false,
  recovering: false,
  fills: [],
}));

const HOME = { center: [52, 18] as [number, number], zoom: 1.75 };

/** The part of the screen not covered by the sidebar, top bar and timeline. */
function restPadding() {
  const wide = window.innerWidth >= 1024;
  const sidebar = wide && useApp.getState().sidebarOpen;
  return { left: sidebar ? 288 : 0, right: 0, top: wide ? 104 : 116, bottom: wide ? 96 : 176 };
}

/**
 * The zoom at which the whole planet fits in that free area, pole to pole.
 * (A globe's on-screen radius is worldSize / 2π / cos(latitude of the centre).)
 */
function fitZoom(el: HTMLElement, flat: boolean) {
  const p = restPadding();
  const w = Math.max(160, (el.clientWidth || 800) - p.left - p.right);
  const h = Math.max(160, (el.clientHeight || 600) - p.top - p.bottom);
  if (flat) return Math.max(0.5, Math.log2((el.clientHeight || 600) / 512) + 0.02);
  const diameter = Math.min(w, h) * 0.94;
  return Math.min(2.4, Math.max(0.2, Math.log2((diameter * Math.PI * Math.cos((HOME.center[1] * Math.PI) / 180)) / 512)));
}
/** Quart ease-out: quick to respond, long gentle landing. */
const glideOut = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * A flat (Mercator) map ends at ±85°, so zoomed far out it would show empty
 * bands above and below the world. Keep it zoomed in just enough to always
 * fill the screen; the globe has no such edge.
 */
function fitMinZoom(map: MLMap, flat: boolean) {
  try {
    const fit = fitZoom(map.getContainer(), flat);
    map.setMinZoom(flat ? fit : Math.max(0.1, fit - 0.45));
  } catch {
    /* noop */
  }
}
/** Degrees of longitude per second at low zoom (one revolution ≈ 160 s). */
const SPIN_DPS = 360 / 160;
/** How long the globe waits after the user lets go before drifting again. */
const RESUME_DELAY = 1600;

function focusPadding() {
  const wide = window.innerWidth >= 1024;
  const sidebar = useApp.getState().sidebarOpen;
  return { left: wide ? (sidebar ? 290 : 0) + 380 : 0, top: 60, right: 80, bottom: wide ? 130 : 300 };
}

export function MapView({ active }: { active: boolean }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const layerIds = useRef<string[]>([]);
  const seq = useRef(0);
  const markers = useRef(new Map<string, { marker: MLMarker; el: HTMLElement }>());
  const activeRef = useRef(active);
  const rotateRef = useRef(true);
  const pauseUntil = useRef(0);
  const fillKey = useRef("");
  // The zoom the planet was last fitted to — lets a resize re-fit it unless the user has zoomed in.
  const fitted = useRef(HOME.zoom);
  // True while the camera is travelling on its own (fly-to), which has its own sound.
  const flying = useRef(false);
  // Bumping this tears the map down and builds a fresh one (WebGL recovery / retry).
  const [generation, setGeneration] = useState(0);
  // Startup cost control: the map (WebGL context + first tile wave) is only
  // built once Explore is shown — or shortly after launch during idle time,
  // so it's usually warm before the user gets there.
  const [warm, setWarm] = useState(active);

  useEffect(() => {
    if (warm) return;
    if (active) {
      setWarm(true);
      return;
    }
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    let timer = 0;
    const kick = () => setWarm(true);
    if (w.requestIdleCallback) w.requestIdleCallback(kick, { timeout: 4000 });
    else timer = window.setTimeout(kick, 2500);
    return () => window.clearTimeout(timer);
  }, [active, warm]);

  const placeCount = useApp((s) => s.places.length);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const flatMap = useApp((s) => s.settings.flatMap);
  const layer = useApp((s) => s.layer);
  const date = useApp((s) => s.exploreDate);
  const focus = useApp((s) => s.focusPlace);
  const flyNonce = useApp((s) => s.flyNonce);
  const mapCmd = useApp((s) => s.mapCmd);
  const autoRotate = useApp((s) => s.settings.autoRotate);
  const reduceMotion = useApp((s) => s.settings.reduceMotion);
  const showLabels = useApp((s) => s.settings.showLabels);
  const failed = useMapTelemetry((s) => s.failed);
  const recovering = useMapTelemetry((s) => s.recovering);

  /** Keep the polar-night fill (older sunlit imagery of the same layer) in step with the layer and date. */
  const syncFills = (map: MLMap, id: LayerId, day: string) => {
    const l = layerById(id);
    const fills = polarFills(l, day);
    const key = `${id}|${fills.map((f) => f.pole + f.date).join("|")}`;
    if (key === fillKey.current) return;
    fillKey.current = key;
    for (const pole of ["north", "south"]) {
      if (map.getLayer(`fill-${pole}`)) map.removeLayer(`fill-${pole}`);
      if (map.getSource(`fill-${pole}`)) map.removeSource(`fill-${pole}`);
    }
    // Directly above the base map, beneath every daily layer.
    const above = layerIds.current.find((x) => map.getLayer(x));
    for (const f of fills) {
      const fid = `fill-${f.pole}`;
      map.addSource(fid, { type: "raster", tiles: filledTileUrls(l, f.date), tileSize: 256, maxzoom: 9, bounds: f.bounds, attribution: "NASA GIBS" });
      map.addLayer({ id: fid, type: "raster", source: fid, paint: { "raster-fade-duration": 450 } }, above);
    }
    useMapTelemetry.setState({ fills });
  };

  /** Add a new imagery layer on top and remove older ones once it has loaded (crossfade). */
  const swap = (map: MLMap, id: LayerId, d: string) => {
    const l = layerById(id);
    const day = d < l.minDate ? l.minDate : d;
    const sid = `gibs-${++seq.current}`;
    try {
      syncFills(map, id, day);
      map.addSource(sid, { type: "raster", tiles: filledTileUrls(l, day), tileSize: 256, maxzoom: 9, attribution: "NASA GIBS" });
      map.addLayer({ id: sid, type: "raster", source: sid, paint: { "raster-fade-duration": 450 } });
    } catch {
      return;
    }
    const old = layerIds.current.slice();
    layerIds.current.push(sid);
    let done = false;
    const cleanup = () => {
      if (mapRef.current !== map) return; // map was rebuilt meanwhile
      old.forEach((o) => {
        try {
          if (map.getLayer(o)) map.removeLayer(o);
          if (map.getSource(o)) map.removeSource(o);
        } catch {
          /* noop */
        }
      });
      layerIds.current = layerIds.current.filter((x) => !old.includes(x));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onData = (e: any) => {
      if (e.sourceId === sid && e.isSourceLoaded) finish();
    };
    const finish = () => {
      if (done) return;
      done = true;
      try {
        map.off("sourcedata", onData);
      } catch {
        /* map removed */
      }
      window.setTimeout(cleanup, 700);
    };
    map.on("sourcedata", onData);
    window.setTimeout(finish, 6000);
  };

  // ------------------------------------------------------------------ init
  useEffect(() => {
    const el = elRef.current;
    if (!el || !warm) return;
    let map: MLMap;
    try {
      // GIBS responds fast and we draw a whole hemisphere — allow more
      // tile fetches in flight than the conservative default.
      maplibregl.setMaxParallelImageRequests?.(32);
      registerGapFill();
      const style = {
        version: 8,
        // Read the saved setting directly: on first load the map is built before the settings effect runs.
        projection: { type: useApp.getState().settings.flatMap ? "mercator" : "globe" },
        // A complete base world sits under the daily imagery, so the poles in
        // polar night and the gaps between orbits are filled instead of black.
        sources: { base: { type: "raster", tiles: BASE_TILES, tileSize: 256, maxzoom: BASE_MAXZOOM, attribution: "NASA Blue Marble" } },
        layers: [
          { id: "space", type: "background", paint: { "background-color": "#0a1626" } },
          { id: "base", type: "raster", source: "base", paint: { "raster-brightness-max": 0.82, "raster-saturation": -0.2, "raster-fade-duration": 300 } },
        ],
        sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
        light: { anchor: "map", position: [1.5, 90, 80] },
      } as unknown as StyleSpecification;
      map = new maplibregl.Map({
        container: el,
        style,
        center: HOME.center,
        zoom: (fitted.current = fitZoom(el, useApp.getState().settings.flatMap)),
        minZoom: 0.1,
        maxZoom: 10.5,
        attributionControl: false,
        fadeDuration: 300,
        pitchWithRotate: false,
        refreshExpiredTiles: false,
      });
    } catch (err) {
      console.warn("[Epoch] Map failed to start", err);
      useMapTelemetry.setState({ failed: true, recovering: false });
      return;
    }
    mapRef.current = map;
    try {
      map.setPadding(restPadding()); // centre the planet in the free area from the first frame
    } catch {
      /* noop */
    }
    useMapTelemetry.setState({ failed: false });

    let disposed = false;
    let raf = 0;
    let last = performance.now();
    let lastLoadCheck = 0;
    let speed = 0;
    let restartTimer = 0;

    /*
     * Auto-rotation runs on its own animation frame and only ever calls jumpTo.
     * It never chains off camera events (moveend etc.), so it cannot re-enter
     * MapLibre's easing machinery — the old easeTo→moveend→easeTo chain could
     * recurse synchronously and lock the whole app.
     */
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const elapsed = Math.max(0, (now - last) / 1000);
      // Movement uses a clamped step (no lurch after a backgrounded tab);
      // speed easing uses real time so it feels identical at 30, 60 or 120 Hz.
      const dt = Math.min(0.1, elapsed);
      last = now;
      if (disposed || !readyRef.current) return;

      // `idle` never fires while spinning, so poll tile state for the UI.
      if (now - lastLoadCheck > 450) {
        lastLoadCheck = now;
        try {
          const loading = !map.areTilesLoaded();
          if (useMapTelemetry.getState().loading !== loading) useMapTelemetry.setState({ loading });
        } catch {
          /* noop */
        }
      }

      let moving = false;
      let zoom = 0;
      try {
        moving = map.isMoving();
        zoom = map.getZoom();
      } catch {
        return;
      }
      // A finger/cursor on the globe stops it dead, like touching a spinning
      // object — even when the press lands on a marker and no drag starts.
      if (moving || pauseUntil.current === Number.POSITIVE_INFINITY) {
        speed = 0; // user gesture or a flight owns the camera
        return;
      }

      let target = 0;
      const canSpin =
        activeRef.current && rotateRef.current && !useApp.getState().focusPlace && !useApp.getState().pin && now > pauseUntil.current && zoom < 4;
      if (canSpin) {
        target = SPIN_DPS;
        if (zoom > 2.5) target *= (4 - zoom) / 1.5;
      }
      // Ease toward the target speed — Apple-style soft start and stop
      // (exponential smoothing, frame-rate independent; ~1 s to full speed).
      speed += (target - speed) * (1 - Math.exp(-elapsed * 2.6));
      if (speed < 0.003 && target === 0) {
        speed = 0;
        return;
      }
      try {
        const c = map.getCenter();
        map.jumpTo({ center: [c.lng - speed * dt, c.lat] });
      } catch {
        /* map is being torn down */
      }
    };
    raf = requestAnimationFrame(loop);

    // Pause on any direct manipulation; resume a little after release.
    const hold = (e: PointerEvent) => {
      pauseUntil.current = Number.POSITIVE_INFINITY;
      // Taking hold of the planet itself (markers are buttons with their own voice).
      if (!(e.target instanceof Element && e.target.closest("button"))) sfx.grab();
    };
    const release = () => {
      if (pauseUntil.current !== Number.POSITIVE_INFINITY) return;
      pauseUntil.current = performance.now() + RESUME_DELAY;
      if (activeRef.current) sfx.release();
    };
    const nudge = () => {
      pauseUntil.current = Math.max(pauseUntil.current, performance.now() + RESUME_DELAY);
    };
    el.addEventListener("pointerdown", hold);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    el.addEventListener("wheel", nudge, { passive: true });

    map.on("load", () => {
      if (disposed) return;
      readyRef.current = true;
      const s = useApp.getState();
      swap(map, s.layer, s.exploreDate);
      fitMinZoom(map, useApp.getState().settings.flatMap);
      useApp.getState().places.forEach((p, i) => {
        const mel = document.createElement("button");
        mel.type = "button";
        mel.className = "epoch-marker";
        mel.style.setProperty("--c", p.color);
        mel.style.setProperty("--d", `${250 + i * 70}ms`); // markers pop in one after another
        mel.setAttribute("aria-label", p.name);
        mel.innerHTML = `<span class="ring"></span><span class="dot"></span><span class="label">${p.name}</span>`;
        mel.addEventListener("click", (ev) => {
          ev.stopPropagation();
          useApp.getState().selectPlace(p.id);
        });
        const marker = new maplibregl.Marker({ element: mel, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(map);
        markers.current.set(p.id, { marker, el: mel });
      });
      const f = s.focusPlace;
      if (f) {
        markers.current.get(f)?.el.classList.add("is-active");
        // The user may have focused a place before the (deferred) map was
        // built, or this is a rebuild — either way, land there instantly.
        const p = placeById(f);
        map.jumpTo({ center: [p.lon, p.lat], zoom: p.zoom - 0.3, padding: focusPadding() });
      }
      useMapTelemetry.setState({ ready: true, recovering: false });
    });

    map.on("error", () => {
      /* tile errors are expected for cloudy/no-data days */
    });
    map.on("rotate", () => useMapTelemetry.setState({ bearing: map.getBearing() }));
    map.on("zoomend", () => useMapTelemetry.setState({ zoom: map.getZoom() }));
    map.on("resize", () => {
      fitMinZoom(map, useApp.getState().settings.flatMap);
      refit(map, 0);
    });
    // A soft detent every fifth of a zoom level, pitched by how far in you are.
    let zoomStep = Math.round(HOME.zoom * 5);
    map.on("zoom", () => {
      const step = Math.round(map.getZoom() * 5);
      if (step === zoomStep) return;
      zoomStep = step;
      // Wheel, pinch and the +/− buttons speak; a camera flight has its own sound instead.
      if (activeRef.current && !flying.current) sfx.zoom(map.getZoom());
    });
    map.on("moveend", () => {
      if (!flying.current) return;
      flying.current = false;
      if (activeRef.current) sfx.arrive();
    });
    map.on("idle", () => useMapTelemetry.setState({ loading: false }));

    // GPU resets happen (driver updates, sleep, too many contexts). Recover
    // gracefully instead of leaving a frozen canvas.
    map.on("webglcontextlost", () => {
      useMapTelemetry.setState({ recovering: true });
      window.clearTimeout(restartTimer);
      restartTimer = window.setTimeout(() => setGeneration((g) => g + 1), 2500);
    });
    map.on("webglcontextrestored", () => {
      window.clearTimeout(restartTimer);
      useMapTelemetry.setState({ recovering: false });
      try {
        map.triggerRepaint();
      } catch {
        /* noop */
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(restartTimer);
      el.removeEventListener("pointerdown", hold);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      el.removeEventListener("wheel", nudge);
      readyRef.current = false;
      markers.current.clear();
      layerIds.current = [];
      fillKey.current = "";
      mapRef.current = null;
      useMapTelemetry.setState({ ready: false, loading: false });
      try {
        map.remove();
      } catch {
        /* context already gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, warm, placeCount]);

  // ------------------------------------------------- imagery layer / date
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    swap(map, layer, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, date]);

  /** Re-fit the whole planet to the free area, unless the user has zoomed in or is looking at a place. */
  const refit = (map: MLMap, duration: number) => {
    const s = useApp.getState();
    if (!readyRef.current || s.focusPlace || s.pin) return;
    let zoom = 0;
    try {
      zoom = map.getZoom();
    } catch {
      return;
    }
    if (zoom > fitted.current + 0.3) return;
    fitted.current = fitZoom(map.getContainer(), s.settings.flatMap);
    const view = { zoom: fitted.current, padding: restPadding() };
    try {
      if (duration && activeRef.current) map.easeTo({ ...view, duration, easing: glideOut, essential: true });
      else map.jumpTo(view);
    } catch {
      /* noop */
    }
  };

  // The sidebar opening or closing changes the free area: slide the planet back to its middle.
  useEffect(() => {
    const map = mapRef.current;
    if (map) refit(map, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarOpen]);

  // ---------------------------------------------------------- focus marker
  useEffect(() => {
    markers.current.forEach(({ el }, id) => el.classList.toggle("is-active", id === focus));
    const map = mapRef.current;
    if (!focus && map && readyRef.current) {
      // flyTo padding is sticky in MapLibre — release it so the globe re-centres.
      try {
        map.easeTo({ padding: restPadding(), duration: 900, easing: glideOut, essential: true });
      } catch {
        /* noop */
      }
    }
  }, [focus]);

  // ---------------------------------------------------------- fly to place
  useEffect(() => {
    const map = mapRef.current;
    const id = useApp.getState().focusPlace;
    const pin = useApp.getState().pin;
    if (!map || (!id && !pin) || flyNonce === 0) return;
    const p = id ? placeById(id) : { lon: pin!.lon, lat: pin!.lat, zoom: (pin!.zoom ?? 8.35 - Math.log2(pin!.span ?? 2) * 1.05) + 0.3 };
    const target = { center: [p.lon, p.lat] as [number, number], zoom: p.zoom - 0.3, padding: id ? focusPadding() : restPadding() };
    try {
      // Only animate when the globe is on screen; otherwise be there already.
      if (activeRef.current) {
        flying.current = true;
        sfx.fly();
        map.flyTo({ ...target, speed: 0.8, curve: 1.5, easing: glideOut, essential: true });
      } else map.jumpTo(target);
    } catch {
      /* noop */
    }
  }, [flyNonce]);

  // ------------------------------------------------------ control commands
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCmd) return;
    nudgePause();
    try {
      switch (mapCmd.kind) {
        case "zoomIn":
        case "zoomOut":
          map.easeTo({ zoom: map.getZoom() + (mapCmd.kind === "zoomIn" ? 1 : -1), duration: 750, easing: glideOut, essential: true });
          break;
        case "north":
          map.easeTo({ bearing: 0, pitch: 0, duration: 700, essential: true });
          break;
        case "home":
          flying.current = true;
          sfx.fly();
          fitted.current = fitZoom(map.getContainer(), useApp.getState().settings.flatMap);
          map.flyTo({ center: HOME.center, zoom: fitted.current, bearing: 0, pitch: 0, speed: 1, easing: glideOut, essential: true, padding: restPadding() });
          break;
        case "projection": {
          const globe = !useMapTelemetry.getState().globe;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (map as any).setProjection({ type: globe ? "globe" : "mercator" });
          useMapTelemetry.setState({ globe });
          break;
        }
      }
    } catch {
      /* noop */
    }
    function nudgePause() {
      pauseUntil.current = Math.max(pauseUntil.current, performance.now() + RESUME_DELAY);
    }
  }, [mapCmd]);

  // ------------------------------------------------- visibility & settings
  useEffect(() => {
    activeRef.current = active;
    const map = mapRef.current;
    if (!map) return;
    try {
      if (active) map.resize();
      else map.stop();
    } catch {
      /* noop */
    }
  }, [active]);

  useEffect(() => {
    rotateRef.current = autoRotate && !reduceMotion;
  }, [autoRotate, reduceMotion]);

  // Settings → "Flat map" switches the projection live.
  useEffect(() => {
    const map = mapRef.current;
    useMapTelemetry.setState({ globe: !flatMap });
    if (!map || !readyRef.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setProjection({ type: flatMap ? "mercator" : "globe" });
    } catch {
      /* noop */
    }
    fitMinZoom(map, flatMap);
    fitted.current = fitZoom(map.getContainer(), flatMap);
    if (!useApp.getState().focusPlace && !useApp.getState().pin) map.jumpTo({ zoom: fitted.current, padding: restPadding() });
  }, [flatMap]);

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 transition-opacity duration-700 ease-apple",
        active ? "opacity-100" : "pointer-events-none opacity-0",
        showLabels && "show-labels"
      )}
    >
      <div className="starfield absolute inset-0" />
      {/* The planet eases forward out of the dark when Explore opens, and sinks back when it closes. */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ scale: active ? 1 : 0.9 }}
        transition={{ type: "spring", stiffness: 110, damping: 20, mass: 1 }}
      >
        <div className="absolute inset-0" style={{ background: "radial-gradient(50% 55% at 55% 50%, rgba(30,90,200,0.22), transparent 70%)" }} />
        <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      </motion.div>

      <AnimatePresence>
        {recovering && active && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            className="pointer-events-none absolute left-1/2 top-[120px] z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-medium text-white/80 glass"
          >
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-ios-teal" />
            Reconnecting the globe…
          </motion.div>
        )}
      </AnimatePresence>

      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            className="max-w-sm rounded-[28px] p-6 text-center glass-strong"
          >
            <Globe className="mx-auto mb-3 text-white/40" size={32} />
            <h3 className="text-[17px] font-semibold">3D globe unavailable</h3>
            <p className="mt-1 text-[13px] text-white/50">This browser couldn’t start WebGL. Compare and Timelapse still work with NASA imagery.</p>
            <button
              onClick={() => setGeneration((g) => g + 1)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/15 active:scale-95"
            >
              <RotateCcw size={14} /> Try again
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
