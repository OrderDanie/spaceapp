import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp, type View } from "@/store";
import { Sidebar, NAV_ITEMS } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { TabBar } from "@/components/shell/TabBar";
import { DynamicIsland } from "@/components/shell/DynamicIsland";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { SettingsSheet } from "@/components/shell/SettingsSheet";
import { Splash } from "@/components/shell/Splash";
import { MapView } from "@/components/MapView";
import { appleEase } from "@/components/ui/primitives";
import { Today } from "@/views/Today";
import { Explore } from "@/views/Explore";
import { Compare } from "@/views/Compare";
import { Timelapse } from "@/views/Timelapse";
import { Places } from "@/views/Places";
import { Alerts } from "@/views/Alerts";
import { useAppNavigation, viewIndex } from "@/lib/navigation";
import { Welcome } from "@/components/shell/Welcome";
import { NetworkMonitor } from "@/components/shell/NetworkMonitor";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OVERLAY_ROOT_ID } from "@/components/OverlayPortal";
import { msSinceLastSound, msSinceLastVoiced, setMoveSounds, setSoundsEnabled, sfx, unlockAudio } from "@/lib/sound";
import { haptic, setHapticsEnabled } from "@/lib/haptics";
import { setRefraction } from "@/lib/liquidGlass";
import { AnalystPanel } from "@/components/analyst/AnalystPanel";
import { AddPlaceSheet } from "@/components/AddPlaceSheet";
import { AppIcon } from "@/components/shell/AppIcon";
import { Button, Spinner } from "@/components/ui/primitives";
import { RotateCcw } from "lucide-react";

const VIEWS: Record<View, () => React.ReactElement> = {
  today: Today,
  explore: Explore,
  compare: Compare,
  timelapse: Timelapse,
  places: Places,
  alerts: Alerts,
};

/** One calm, static wash of light behind every page. */
function Backdrop({ hidden }: { hidden: boolean }) {
  return (
    <div className={cn("absolute inset-0 transition-opacity duration-700", hidden ? "opacity-0" : "opacity-100")}>
      <div className="starfield absolute inset-0 opacity-40" />
      <div className="absolute inset-x-0 top-0 h-[75vh]" style={{ background: "radial-gradient(ellipse 85% 100% at 50% 0%, rgba(36,99,190,0.2), transparent 72%)" }} />
    </div>
  );
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.setPalette(!s.paletteOpen);
        return;
      }
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        s.setAnalyst(!s.analystOpen);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        s.setSettings(true);
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        s.toggleSidebar();
        return;
      }
      if (e.key === "Escape") {
        if (s.paletteOpen) s.setPalette(false);
        else if (s.settingsOpen) s.setSettings(false);
        else if (s.addPlace) s.setAddPlace(null);
        else if (s.analystOpen) s.setAnalyst(false);
        return;
      }
      // Ignore page shortcuts while a modal surface (welcome, splash, overlays) owns the keyboard.
      const blocked = !s.welcomeSeen || !!document.querySelector("[data-epoch-modal]");
      if (typing || mod || e.altKey || s.paletteOpen || s.settingsOpen || blocked) return;
      if (e.key === "/") {
        e.preventDefault();
        s.setPalette(true);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= NAV_ITEMS.length) s.setView(NAV_ITEMS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Ready() {
  const view = useApp((s) => s.view);
  const sheetOpen = useApp((s) => s.settingsOpen || !!s.addPlace);
  const reduce = useApp((s) => s.settings.reduceMotion);
  const welcomeSeen = useApp((s) => s.welcomeSeen);
  const previousView = useRef(view);
  const [booted, setBooted] = useState(() => {
    try {
      return sessionStorage.getItem("epoch-booted") === "1";
    } catch {
      return false;
    }
  });
  const finishBoot = useCallback(() => {
    try {
      sessionStorage.setItem("epoch-booted", "1");
    } catch {
      /* noop */
    }
    setBooted(true);
  }, []);

  useHotkeys();
  useAppNavigation();
  const ViewComponent = VIEWS[view];
  const isExplore = view === "explore";
  const direction = Math.sign(viewIndex(view) - viewIndex(previousView.current)) || 1;

  useEffect(() => {
    previousView.current = view;
  }, [view]);

  // Apply reduced motion at the document root so portaled overlays follow it too.
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduce);
  }, [reduce]);

  // ---- Sound design: keep the engine in sync, unlock on first gesture ----
  const soundsOn = useApp((s) => s.settings.sounds !== false);
  const hapticsOn = useApp((s) => s.settings.haptics !== false);
  useEffect(() => setSoundsEnabled(soundsOn), [soundsOn]);
  useEffect(() => setHapticsEnabled(hapticsOn), [hapticsOn]);
  const refractionOn = useApp((s) => s.settings.refraction !== false);
  useEffect(() => setRefraction(refractionOn), [refractionOn]);
  const moveSoundsOn = useApp((s) => s.settings.moveSounds !== false);
  useEffect(() => setMoveSounds(moveSoundsOn), [moveSoundsOn]);

  // Sound for every touch and every move — all of it soft. One set of
  // listeners covers the whole app, so no control can be forgotten:
  //   touch down → low "thup" · release on a control → tap · pointer gliding
  //   onto a control → faint tick · dragging anything → airy glide ·
  //   scrolling → detents · typing → key ticks · arrow keys → selection tick.
  // Components with a more specific voice (switches, sliders, the globe) speak
  // first; the generic sound stays silent when one of those just played.
  useEffect(() => {
    const CONTROL = "button, a, [role='button'], [role='tab'], [role='switch'], [role='slider'], input, textarea, select, [data-sound]";
    const control = (t: EventTarget | null) => (t instanceof Element && !t.closest("[data-silent], :disabled") ? t.closest(CONTROL) : null);
    let hovered: Element | null = null;
    let drag: { x: number; y: number; t: number; travelled: number; total: number } | null = null;
    const scrolled = new WeakMap<EventTarget, number>();
    const travelled = new WeakMap<EventTarget, number>();

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now(), travelled: 0, total: 0 };
      if (control(e.target)) {
        haptic("light");
        sfx.touch();
      } else if (msSinceLastSound() > 60) sfx.touch(0.55);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const now = performance.now();
      const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      const dt = Math.max(1, now - drag.t);
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      drag.travelled += dist;
      drag.total += dist;
      if (drag.travelled < 26) return;
      drag.travelled = 0;
      if (msSinceLastSound() > 70) sfx.glide(dist / dt / 2.2);
    };
    const up = () => {
      // Letting go after really moving something gets a soft release.
      if (drag && drag.total > 70 && msSinceLastSound() > 90) sfx.release();
      drag = null;
    };
    const click = (e: MouseEvent) => {
      const c = control(e.target);
      // Stay silent only when the control has just spoken for itself (a switch, a sheet opening…).
      if (!c || msSinceLastVoiced() <= 70) return;
      // Glass answers with a drop of water; everything else with the plain tap.
      if (c.closest(".glass")) sfx.droplet();
      else sfx.tap();
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || drag) return;
      const c = control(e.target) ?? (e.target instanceof Element ? e.target.closest(".card, .epoch-marker") : null);
      if (c === hovered) return;
      hovered = c;
      if (c) sfx.hover();
    };
    const input = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "range") sfx.scrub();
      else if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) sfx.key();
    };
    const scroll = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const pos = t.scrollTop + t.scrollLeft;
      const last = scrolled.get(t);
      scrolled.set(t, pos);
      if (last === undefined) return;
      const sum = (travelled.get(t) ?? 0) + Math.abs(pos - last);
      if (sum >= 150) {
        travelled.set(t, 0);
        if (msSinceLastSound() > 80) sfx.scroll();
      } else travelled.set(t, sum);
    };
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.startsWith("Arrow") || e.key === "Tab") sfx.tick();
      else if (e.key === "Enter" || e.key === "Escape") sfx.touch(0.7);
    };
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    window.addEventListener("click", click);
    window.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("input", input);
    window.addEventListener("scroll", scroll, { capture: true, passive: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("click", click);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("input", input);
      window.removeEventListener("scroll", scroll, { capture: true });
      window.removeEventListener("keydown", key);
    };
  }, []);

  // One honest launch note: unread alerts that were actually measured.
  useEffect(() => {
    if (!booted || !welcomeSeen) return;
    const t = window.setTimeout(() => {
      const s = useApp.getState();
      if (!s.settings.announceAlerts || sessionStorage.getItem("epoch-announced")) return;
      const unread = s.alerts.filter((a) => !s.readAlerts.includes(a.id) && !s.dismissed.includes(a.id));
      if (!unread.length) return;
      sessionStorage.setItem("epoch-announced", "1");
      s.notify({ title: `${unread.length} measured change${unread.length === 1 ? "" : "s"} to review`, subtitle: unread[0].title, icon: "sparkles", tone: "purple", duration: 4200, actionLabel: "Open", action: () => useApp.getState().setView("alerts") });
    }, 2600);
    return () => window.clearTimeout(t);
  }, [booted, welcomeSeen]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  // A soft breath of air when moving between sections (not on first paint).
  const navPrimed = useRef(false);
  const lastViewIdx = useRef(viewIndex(view));
  useEffect(() => {
    if (!navPrimed.current) {
      navPrimed.current = true;
      return;
    }
    const idx = viewIndex(view);
    if (booted && welcomeSeen) sfx.navigate(idx - lastViewIdx.current);
    lastViewIdx.current = idx;
  }, [view, booted, welcomeSeen]);

  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div data-view={view} className="fixed inset-0 overflow-hidden bg-black text-white">
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ transformOrigin: "50% 100%" }}
          initial={false}
          animate={sheetOpen ? { scale: 0.93, y: 12, borderRadius: 32, opacity: 0.5 } : { scale: 1, y: 0, borderRadius: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 34 }}
        >
          <Backdrop hidden={isExplore} />
          <ErrorBoundary label="The globe" compact>
            <MapView active={isExplore} />
          </ErrorBoundary>

          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.main
              key={view}
              custom={direction}
              className={cn("absolute inset-0", isExplore && "pointer-events-none")}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 44, scale: 0.975, filter: "blur(12px)" }),
                center: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
                exit: (d: number) => ({ opacity: 0, x: d * -30, scale: 0.985, filter: "blur(10px)", transition: { duration: 0.24, ease: appleEase } }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9, opacity: { duration: 0.3 }, filter: { duration: 0.35 } }}
            >
              <ErrorBoundary resetKey={view} label={NAV_ITEMS.find((n) => n.id === view)?.label}>
                <ViewComponent />
              </ErrorBoundary>
            </motion.main>
          </AnimatePresence>

          <Sidebar />
          <TopBar />
          <TabBar />
        </motion.div>

        {/* Overlay layer: above the app, below the Dynamic Island / Spotlight / Settings. */}
        <div id={OVERLAY_ROOT_ID} className="pointer-events-none absolute inset-0 z-[86] [&>*]:pointer-events-auto" />
        <AnalystPanel />
        <AddPlaceSheet />
        <DynamicIsland />
        <NetworkMonitor />
        <CommandPalette />
        <SettingsSheet />

        <AnimatePresence>{!booted && <Splash key="splash" onDone={finishBoot} />}</AnimatePresence>
        <AnimatePresence>{booted && !welcomeSeen && <Welcome key="welcome" />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}


/** Loads places, measurements and saved state from the database before the app mounts. */
export default function App() {
  const boot = useApp((s) => s.boot);
  const step = useApp((s) => s.bootStep);
  const error = useApp((s) => s.bootError);
  useEffect(() => {
    void useApp.getState().bootstrap();
  }, []);
  if (boot === "ready") return <Ready />;
  return (
    <div className="starfield fixed inset-0 grid place-items-center bg-black p-6 text-white">
      <div className="flex max-w-sm flex-col items-center text-center">
        <AppIcon size={84} animated />
        <h1 className="mt-6 text-[28px] font-bold tracking-tight">Epoch</h1>
        {boot === "loading" ? (
          <p className="mt-3 flex items-center gap-2.5 text-[13.5px] text-white/55">
            <Spinner /> {["Connecting to the database", "Loading your places", "Reading measurements", "Almost there"][Math.min(step, 3)]}…
          </p>
        ) : (
          <>
            <p className="mt-3 text-[14px] leading-relaxed text-white/60">Epoch couldn’t load its places from the database. {error}</p>
            <Button className="mt-5" variant="primary" icon={RotateCcw} onClick={() => void useApp.getState().bootstrap()}>
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
