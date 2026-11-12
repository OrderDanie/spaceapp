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
import { setSoundsEnabled, sfx, unlockAudio } from "@/lib/sound";

const VIEWS: Record<View, () => React.ReactElement> = {
  today: Today,
  explore: Explore,
  compare: Compare,
  timelapse: Timelapse,
  places: Places,
  alerts: Alerts,
};

const VIEW_AURA: Record<View, string> = {
  today: "rgba(10,132,255,0.2)",
  explore: "rgba(10,132,255,0)",
  compare: "rgba(191,90,242,0.2)",
  timelapse: "rgba(255,159,10,0.17)",
  places: "rgba(48,209,88,0.15)",
  alerts: "rgba(255,69,58,0.16)",
};

function Backdrop({ hidden, view }: { hidden: boolean; view: View }) {
  return (
    <div className={cn("absolute inset-0 transition-opacity duration-700", hidden ? "opacity-0" : "opacity-100")}>
      <div className="starfield absolute inset-0 opacity-70" />
      <AnimatePresence initial={false}>
        <motion.div
          key={view}
          className="absolute inset-0"
          style={{ background: `radial-gradient(70% 65% at 55% 35%, ${VIEW_AURA[view]}, transparent 68%)` }}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 1, ease: appleEase }}
        />
      </AnimatePresence>
      <div
        className="absolute -left-[15%] -top-[25%] h-[80vh] w-[70vw] animate-drift rounded-full"
        style={{ background: "radial-gradient(circle, rgba(10,132,255,0.22), transparent 62%)" }}
      />
      <div
        className="absolute -right-[15%] top-[5%] h-[70vh] w-[60vw] animate-drift rounded-full [animation-delay:-8s]"
        style={{ background: "radial-gradient(circle, rgba(94,92,230,0.2), transparent 62%)" }}
      />
      <div
        className="absolute -bottom-[30%] left-[25%] h-[70vh] w-[60vw] animate-drift rounded-full [animation-delay:-15s]"
        style={{ background: "radial-gradient(circle, rgba(100,210,255,0.12), transparent 62%)" }}
      />
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

export default function App() {
  const view = useApp((s) => s.view);
  const settingsOpen = useApp((s) => s.settingsOpen);
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
  useEffect(() => setSoundsEnabled(soundsOn), [soundsOn]);
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
  useEffect(() => {
    if (!navPrimed.current) {
      navPrimed.current = true;
      return;
    }
    if (booted && welcomeSeen) sfx.navigate();
  }, [view, booted, welcomeSeen]);

  return (
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div data-view={view} className="fixed inset-0 overflow-hidden bg-black text-white">
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ transformOrigin: "50% 100%" }}
          initial={false}
          animate={settingsOpen ? { scale: 0.93, y: 12, borderRadius: 32, opacity: 0.5 } : { scale: 1, y: 0, borderRadius: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 34 }}
        >
          <Backdrop hidden={isExplore} view={view} />
          <ErrorBoundary label="The globe" compact>
            <MapView active={isExplore} />
          </ErrorBoundary>

          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.main
              key={view}
              custom={direction}
              className={cn("absolute inset-0", isExplore && "pointer-events-none")}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 28, scale: 0.99, filter: "blur(10px)" }),
                center: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
                exit: (d: number) => ({ opacity: 0, x: d * -20, scale: 0.995, filter: "blur(8px)" }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: appleEase }}
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
