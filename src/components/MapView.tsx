import { useEffect, useRef, useState } from "react";
import * as maplibreNS from "maplibre-gl";
import type { Map as MLMap, Marker as MLMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, RotateCcw } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { PLACES, placeById } from "@/data/places";
import { layerById, tileUrls, type LayerId } from "@/lib/gibs";

// v5 ships UMD — normalise default/namespace interop.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const maplibregl: any = (maplibreNS as any).default ?? maplibreNS;

interface Telemetry {
  bearing: number;
  zoom: number;
  globe: boolean;
  loading: boolean;
  ready: boolean;
  failed: boolean;
  recovering: boolean;
}
export const useMapTelemetry = create<Telemetry>(() => ({
  bearing: 0,
  zoom: 1.7,
  globe: true,
  loading: false,
  ready: false,
  failed: false,
  recovering: false,
}));

const HOME = { center: [52, 22] as [number, number], zoom: 1.75 };
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };
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

  /** Add a new imagery layer on top and remove older ones once it has loaded (crossfade). */
  const swap = (map: MLMap, id: LayerId, d: string) => {
    const l = layerById(id);
    const day = d < l.minDate ? l.minDate : d;
    const sid = `gibs-${++seq.current}`;
    try {
      map.addSource(sid, { type: "raster", tiles: tileUrls(l, day), tileSize: 256, maxzoom: 9, attribution: "NASA GIBS" });
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
      const style = {
        version: 8,
        projection: { type: useMapTelemetry.getState().globe ? "globe" : "mercator" },
        sources: {},
        layers: [],
        sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
        light: { anchor: "map", position: [1.5, 90, 80] },
      } as unknown as StyleSpecification;
      map = new maplibregl.Map({
        container: el,
        style,
        center: HOME.center,
        zoom: HOME.zoom,
        minZoom: 0.6,
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
        activeRef.current && rotateRef.current && !useApp.getState().focusPlace && now > pauseUntil.current && zoom < 4;
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
    const hold = () => {
      pauseUntil.current = Number.POSITIVE_INFINITY;
    };
    const release = () => {
      if (pauseUntil.current === Number.POSITIVE_INFINITY) pauseUntil.current = performance.now() + RESUME_DELAY;
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
      PLACES.forEach((p) => {
        const mel = document.createElement("button");
        mel.type = "button";
        mel.className = "epoch-marker";
        mel.style.setProperty("--c", p.color);
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
      mapRef.current = null;
      useMapTelemetry.setState({ ready: false, loading: false });
      try {
        map.remove();
      } catch {
        /* context already gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, warm]);

  // ------------------------------------------------- imagery layer / date
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    swap(map, layer, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, date]);

  // ---------------------------------------------------------- focus marker
  useEffect(() => {
    markers.current.forEach(({ el }, id) => el.classList.toggle("is-active", id === focus));
    const map = mapRef.current;
    if (!focus && map && readyRef.current) {
      // flyTo padding is sticky in MapLibre — release it so the globe re-centres.
      try {
        map.easeTo({ padding: NO_PADDING, duration: 900, essential: true });
      } catch {
        /* noop */
      }
    }
  }, [focus]);

  // ---------------------------------------------------------- fly to place
  useEffect(() => {
    const map = mapRef.current;
    const id = useApp.getState().focusPlace;
    if (!map || !id || flyNonce === 0) return;
    const p = placeById(id);
    const target = { center: [p.lon, p.lat] as [number, number], zoom: p.zoom - 0.3, padding: focusPadding() };
    try {
      // Only animate when the globe is on screen; otherwise be there already.
      if (activeRef.current) map.flyTo({ ...target, speed: 0.85, curve: 1.45, essential: true });
      else map.jumpTo(target);
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
          map.zoomIn({ duration: 450, essential: true });
          break;
        case "zoomOut":
          map.zoomOut({ duration: 450, essential: true });
          break;
        case "north":
          map.easeTo({ bearing: 0, pitch: 0, duration: 700, essential: true });
          break;
        case "home":
          map.flyTo({ center: HOME.center, zoom: HOME.zoom, bearing: 0, pitch: 0, speed: 1.1, essential: true, padding: NO_PADDING });
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
      <div className="absolute inset-0" style={{ background: "radial-gradient(50% 55% at 55% 50%, rgba(30,90,200,0.22), transparent 70%)" }} />
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

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
