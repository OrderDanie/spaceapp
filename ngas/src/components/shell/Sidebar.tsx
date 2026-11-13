import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import { MOD, shortcut } from "@/lib/keyboard";
import type { LucideIcon } from "lucide-react";
import { Bell, Columns2, Earth, Film, MapPin, PanelLeft, Plus, Search, Sparkles, Sun } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp, useUnreadCount, type View } from "@/store";
import { IconButton, Kbd, softSpring, spring } from "@/components/ui/primitives";
import { AppIcon } from "./AppIcon";
import { useConnectivity } from "@/hooks/useConnectivity";
import { PALETTE_MORPH_ID } from "./CommandPalette";
import { APP_ICON_MORPH_ID, morphLayout, useBrandMorphTarget, useSearchMorphTarget } from "@/hooks/useMorphTargets";
import { RollingNumber } from "@/components/ui/motion";
import { trendOf } from "@/lib/metrics";
import { fmtDate, latestISO } from "@/lib/gibs";

export const NAV_ITEMS: { id: View; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "today", label: "Today", icon: Sun, hint: "What has changed" },
  { id: "explore", label: "Explore", icon: Earth, hint: "Globe & daily imagery" },
  { id: "compare", label: "Compare", icon: Columns2, hint: "Before & after, measured" },
  { id: "timelapse", label: "Timelapse", icon: Film, hint: "Decades in seconds" },
  { id: "places", label: "Places", icon: MapPin, hint: "Everything you track" },
  { id: "alerts", label: "Alerts", icon: Bell, hint: "Measured changes & live events" },
];

function NavItem({ item, active, hovered, onHover, badge, onClick }: { item: (typeof NAV_ITEMS)[number]; active: boolean; hovered: boolean; onHover: () => void; badge?: number; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <motion.button
      aria-current={active ? "page" : undefined}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      onPointerEnter={onHover}
      onFocus={onHover}
      className={cn(
        "group relative flex h-9 w-full items-center gap-3 rounded-[11px] px-2.5 text-[13.5px] font-medium transition-colors",
        active ? "text-white" : "text-white/70 hover:text-white"
      )}
    >
      {/* One highlight that glides from row to row, instead of each row blinking on and off. */}
      {hovered && !active && <motion.span layoutId="nav-hover" className="absolute inset-0 rounded-[11px] bg-white/[0.06]" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-[11px] bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_12px_-4px_rgba(0,0,0,0.5)]"
          transition={spring}
        />
      )}
      <motion.span
        key={active ? "on" : "off"}
        initial={active ? { scale: 0.85 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 520, damping: 28 }}
        className="relative grid place-items-center"
      >
        <Icon size={17} strokeWidth={active ? 2.4 : 2} className="text-[#4aa3ff]" />
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

function WatchRow({ id }: { id: string }) {
  const place = useApp((s) => s.places.find((p) => p.id === id));
  const series = useApp((s) => s.series[id]);
  const active = useApp((s) => s.focusPlace === id && s.view === "explore");
  const selectPlace = useApp((s) => s.selectPlace);
  if (!place) return null;
  const t = trendOf(place, series?.rows);
  const up = (t.total ?? 0) >= 0;
  return (
    <motion.button
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
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: place.color, boxShadow: `0 0 8px ${place.color}` }} />
      <span className="truncate">{place.name}</span>
      {t.total != null && (
        <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-white/35" title={`Measured change, ${t.first!.year}–${t.last!.year}`}>
          {up ? "+" : "−"}
          {Math.abs(t.total).toFixed(0)}%
        </span>
      )}
    </motion.button>
  );
}

export function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const open = useApp((s) => s.sidebarOpen);
  const toggle = useApp((s) => s.toggleSidebar);
  const setPalette = useApp((s) => s.setPalette);
  const setAnalyst = useApp((s) => s.setAnalyst);
  const analystOpen = useApp((s) => s.analystOpen);
  const setAddPlace = useApp((s) => s.setAddPlace);
  const watchlist = useApp((s) => s.watchlist);
  const measured = useApp((s) => Object.values(s.series).reduce((n, x) => n + x.rows.length, 0));
  const unread = useUnreadCount();
  const [hover, setHover] = useState<View | null>(null);
  const primed = useRef(false);
  useEffect(() => {
    if (primed.current) sfx.slide(!open);
    primed.current = true;
  }, [open]);
  const online = useConnectivity();
  const brand = useBrandMorphTarget();
  const search = useSearchMorphTarget();
  // Subscribing makes the search field re-render (and take a layout snapshot)
  // in the same commit Spotlight mounts — required for the shared morph.
  const paletteOpen = useApp((s) => s.paletteOpen);

  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : -300, opacity: open ? 1 : 0, scale: open ? 1 : 0.96 }}
      transition={softSpring}
      className="absolute bottom-3 left-3 top-3 z-40 hidden w-[264px] flex-col rounded-[28px] glass liquid lg:flex"
      style={{ pointerEvents: open ? "auto" : "none" }}
      aria-hidden={!open}
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <motion.div
          key={brand === "sidebar" ? "brand-morph" : "brand"}
          layoutId={brand === "sidebar" ? APP_ICON_MORPH_ID : undefined}
          transition={morphLayout}
          whileTap={{ scale: 0.94 }}
          style={{ borderRadius: 9 }}
        >
          <AppIcon size={38} />
        </motion.div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-bold tracking-tight">Epoch</div>
          <div className="text-[11.5px] text-white/45">Earth, over time</div>
        </div>
        <IconButton icon={PanelLeft} label={`Hide sidebar  ${shortcut("\\")}`} variant="plain" size="sm" onClick={toggle} tooltipSide="right" />
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
        <Search size={14} />
        Search
        <span className="ml-auto flex gap-1">
          <Kbd>{MOD}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </motion.button>

      <nav className="space-y-0.5 px-2" aria-label="Sections" onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}>
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.id} item={item} active={view === item.id} hovered={hover === item.id} onHover={() => setHover(item.id)} badge={item.id === "alerts" ? unread : undefined} onClick={() => setView(item.id)} />
        ))}
      </nav>

      <div className="px-2 pt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setAnalyst(!analystOpen)}
          aria-pressed={analystOpen}
          className={cn(
            "group relative flex h-9 w-full items-center gap-3 rounded-[11px] px-2.5 text-[13.5px] font-medium ring-1 ring-inset transition-colors",
            analystOpen ? "bg-ios-blue/20 text-white ring-ios-blue/40" : "bg-white/[0.05] text-white/85 ring-white/[0.07] hover:bg-white/[0.08] hover:text-white"
          )}
        >
          <Sparkles size={17} className="text-[#4aa3ff]" />
          Ask Epoch
          <span className="ml-auto flex gap-1">
            <Kbd>{MOD}</Kbd>
            <Kbd>J</Kbd>
          </span>
        </motion.button>
      </div>

      <div className="mt-5 flex items-center justify-between px-5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35">Watchlist</span>
        <button
          onClick={() => setAddPlace({})}
          aria-label="Track a new place"
          className="grid h-5 w-5 place-items-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
        <AnimatePresence initial={false}>
          {watchlist.map((id) => (
            <WatchRow key={id} id={id} />
          ))}
        </AnimatePresence>
        {watchlist.length === 0 && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setAddPlace({})}
            className="mx-2 mt-2 flex w-[calc(100%-16px)] items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/10 py-3 text-[12px] font-medium text-white/40 transition-colors hover:border-white/20 hover:text-white/65"
          >
            <Plus size={13} /> Track a place
          </motion.button>
        )}
      </div>

      <div className="m-3 rounded-[16px] bg-white/[0.04] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={cn("relative h-2 w-2 rounded-full", online ? "bg-ios-green" : "bg-ios-orange")} />
          </span>
          <span className="text-[12px] font-semibold">NASA GIBS</span>
          <span className={cn("ml-auto text-[11px]", online ? "text-white/40" : "text-ios-orange")}>{online ? "Online" : "Offline"}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-white/40">
          <span>Newest full day</span>
          <span className="text-white/70">{fmtDate(latestISO(), "short")}</span>
        </div>
        <div className="mt-0.5 flex justify-between text-[11px] text-white/40">
          <span>Measurements on file</span>
          <span className="tabular-nums text-white/70">{measured.toLocaleString("en-US")}</span>
        </div>
      </div>
    </motion.aside>
  );
}
