import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Bell, Columns2, Earth, Film, MapPin, Minus, PanelLeft, Plus, Search, Sun, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp, useUnreadCount, type View } from "@/store";
import { placeById } from "@/data/places";
import { IconButton, Kbd, softSpring, spring } from "@/components/ui/primitives";
import { AppIcon } from "./AppIcon";
import { useConnectivity } from "@/hooks/useConnectivity";
import { PALETTE_MORPH_ID } from "./CommandPalette";
import { APP_ICON_MORPH_ID, morphLayout, useBrandMorphTarget, useSearchMorphTarget } from "@/hooks/useMorphTargets";
import { RollingNumber, useNow } from "@/components/ui/motion";

export const NAV_ITEMS: { id: View; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "today", label: "Today", icon: Sun, hint: "Your daily briefing" },
  { id: "explore", label: "Explore", icon: Earth, hint: "Live globe & daily imagery" },
  { id: "compare", label: "Compare", icon: Columns2, hint: "Before & after" },
  { id: "timelapse", label: "Timelapse", icon: Film, hint: "Decades in seconds" },
  { id: "places", label: "Places", icon: MapPin, hint: "Everything you track" },
  { id: "alerts", label: "Alerts", icon: Bell, hint: "Detected changes" },
];

function TrafficLights({ onClose, onMin, onMax }: { onClose: () => void; onMin: () => void; onMax: () => void }) {
  const [hover, setHover] = useState(false);
  const lights = [
    { c: "#ff5f57", Icon: X, fn: onClose, label: "Close sidebar" },
    { c: "#febc2e", Icon: Minus, fn: onMin, label: "Minimize sidebar" },
    { c: "#28c840", Icon: Plus, fn: onMax, label: "Full screen" },
  ];
  return (
    <div className="flex gap-2" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      {lights.map(({ c, Icon, fn, label }) => (
        <motion.button
          key={c}
          aria-label={label}
          whileTap={{ scale: 0.85 }}
          onClick={fn}
          className="grid h-3 w-3 place-items-center rounded-full"
          style={{ background: c, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.3)" }}
        >
          <motion.span initial={false} animate={{ opacity: hover ? 1 : 0, scale: hover ? 1 : 0.5 }}>
            <Icon size={8} strokeWidth={3.5} className="text-black/60" />
          </motion.span>
        </motion.button>
      ))}
    </div>
  );
}

function NavItem({ item, active, badge, onClick }: { item: (typeof NAV_ITEMS)[number]; active: boolean; badge?: number; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <motion.button
      aria-current={active ? "page" : undefined}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "group relative flex h-9 w-full items-center gap-3 rounded-[11px] px-2.5 text-[13.5px] font-medium transition-colors",
        active ? "text-white" : "text-white/70 hover:text-white"
      )}
    >
      <span className="absolute inset-0 rounded-[11px] transition-colors group-hover:bg-white/[0.05]" />
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-[11px] bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_12px_-4px_rgba(0,0,0,0.5)]"
          transition={spring}
        />
      )}
      <motion.span
        key={active ? "on" : "off"}
        initial={active ? { scale: 0.55, rotate: -14 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 14 }}
        className="relative grid place-items-center"
      >
        <Icon size={17} strokeWidth={active ? 2.4 : 2} className="text-[#4aa3ff] transition-transform duration-300 ease-apple group-hover:-translate-y-px group-hover:scale-110" />
      </motion.span>
      <span className="relative">{item.label}</span>
      <AnimatePresence initial={false}>
        {badge ? (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="relative ml-auto rounded-full bg-white/10 px-1.5 py-px text-[11px] font-semibold text-white/70"
          >
            <RollingNumber value={badge} stagger={0.02} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

const BARS = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 10, 13, 16, 12, 15, 18, 14, 17, 20, 16, 19, 22, 18, 21];
const sessionStart = Date.now();

export function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const open = useApp((s) => s.sidebarOpen);
  const toggle = useApp((s) => s.toggleSidebar);
  const setPalette = useApp((s) => s.setPalette);
  const watchlist = useApp((s) => s.watchlist);
  const selectPlace = useApp((s) => s.selectPlace);
  const focus = useApp((s) => s.focusPlace);
  const unread = useUnreadCount();
  const online = useConnectivity();
  const brand = useBrandMorphTarget();
  const search = useSearchMorphTarget();
  // Subscribing makes the search field re-render (and take a layout snapshot)
  // in the same commit Spotlight mounts — required for the shared morph.
  const paletteOpen = useApp((s) => s.paletteOpen);
  const now = useNow(4000);
  // Ticks up a few tiles every few seconds while online — a quiet sign of life.
  const tiles = 1284 + (online ? Math.floor((now - sessionStart) / 4000) * 3 : 0);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : -300, opacity: open ? 1 : 0, scale: open ? 1 : 0.96 }}
      transition={softSpring}
      className="absolute bottom-3 left-3 top-3 z-40 hidden w-[264px] flex-col rounded-[28px] glass liquid lg:flex"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <TrafficLights onClose={toggle} onMin={toggle} onMax={fullscreen} />
        <IconButton icon={PanelLeft} label="Hide sidebar" variant="plain" size="sm" onClick={toggle} tooltipSide="right" />
      </div>

      <div className="flex items-center gap-3 px-4 pb-3 pt-3">
        <motion.div
          key={brand === "sidebar" ? "brand-morph" : "brand"}
          layoutId={brand === "sidebar" ? APP_ICON_MORPH_ID : undefined}
          transition={morphLayout}
          whileHover={{ rotate: -6, scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          style={{ borderRadius: 9 }}
        >
          <AppIcon size={38} />
        </motion.div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">Epoch</div>
          <div className="text-[11.5px] text-white/45">Earth, over time</div>
        </div>
      </div>

      <motion.button
        key={search === "sidebar" ? "search-morph" : "search"}
        layoutId={search === "sidebar" ? PALETTE_MORPH_ID : undefined}
        data-palette-open={paletteOpen || undefined}
        style={{ borderRadius: 11 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setPalette(true)}
        className="group mx-3 mb-3 flex h-9 items-center gap-2 rounded-[11px] bg-white/[0.06] px-3 text-[13px] text-white/45 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.09] hover:text-white/70"
      >
        <Search size={14} className="transition-transform duration-300 ease-apple group-hover:scale-110 group-hover:-rotate-6" />
        Search
        <span className="ml-auto flex gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </motion.button>

      <nav className="space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={view === item.id}
            badge={item.id === "alerts" ? unread : undefined}
            onClick={() => setView(item.id)}
          />
        ))}
      </nav>

      <div className="mt-5 flex items-center justify-between px-5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35">Watchlist</span>
        <span className="text-[11px] tabular-nums text-white/30">{watchlist.length}</span>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
        <AnimatePresence initial={false}>
          {watchlist.map((id) => {
            const p = placeById(id);
            const active = focus === id && view === "explore";
            return (
              <motion.button
                key={id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 32 }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring}
                onClick={() => selectPlace(id, "explore")}
                className={cn(
                  "group flex w-full items-center gap-2.5 overflow-hidden rounded-[10px] px-2.5 text-[13px] transition-colors",
                  active ? "bg-white/[0.08] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white"
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
                <span className="truncate">{p.name}</span>
                {p.status === "Critical" && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-blink rounded-full bg-ios-red" />}
              </motion.button>
            );
          })}
        </AnimatePresence>
        {watchlist.length === 0 && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setPalette(true)}
            className="mx-2 mt-2 flex w-[calc(100%-16px)] items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/10 py-3 text-[12px] font-medium text-white/40 transition-colors hover:border-white/20 hover:text-white/65"
          >
            <Plus size={13} /> Track a place
          </motion.button>
        )}
      </div>

      <div className="m-3 rounded-[18px] bg-white/[0.04] p-3 ring-1 ring-inset ring-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {online && <span className="absolute inset-0 animate-ping rounded-full bg-ios-green" />}
            <span className={cn("relative h-2 w-2 rounded-full", online ? "bg-ios-green" : "bg-ios-orange")} />
          </span>
          <span className="text-[12px] font-semibold">NASA GIBS</span>
          <span className={cn("ml-auto text-[11px]", online ? "text-white/40" : "text-ios-orange")}>{online ? "Connected" : "Offline"}</span>
        </div>
        <div className="mt-2.5 flex h-7 items-end gap-[3px]">
          {BARS.map((h, i) => (
            <motion.span
              key={i}
              className={cn("flex-1 origin-bottom rounded-[2px]", online ? "bg-gradient-to-t from-ios-blue/40 to-ios-teal/80" : "bg-white/10")}
              style={{ height: `${(h / 22) * 100}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.6 + i * 0.025 }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-white/45">
          <span>Tiles streamed today</span>
          <RollingNumber value={tiles} className="text-white/75" stagger={0.02} />
        </div>
      </div>
    </motion.aside>
  );
}
