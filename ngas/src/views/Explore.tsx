import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, Columns2, Film, Globe, Layers, LocateFixed, Map as MapIcon, Minus, Pause, Play, Plus, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { placeById, useApp, usePlace, useSeries } from "@/store";
import { goodWhenUp, trendOf } from "@/lib/metrics";
import { fmtKm2, targetOf } from "@/lib/spectral";
import { useMapTelemetry } from "@/components/MapView";
import { TimeRuler } from "@/components/TimeRuler";
import { morphTransition, stageId } from "@/components/CompareStage";
import { Burst } from "@/components/ui/Burst";
import { pageShortcutBlocked } from "@/lib/keyboard";
import { sfx } from "@/lib/sound";
import { warmCompareWhenIdle } from "@/lib/warm";
import { LAYERS, addDays, fmtDate, latestISO, layerById, snapshotUrl, withYearMonth, yearOf } from "@/lib/gibs";
import { SatImage } from "@/components/ui/SatImage";
import { RollingNumber } from "@/components/ui/motion";
import { Button, CategoryIcon, IconButton, Popover, Pressable, StatusBadge, Tooltip } from "@/components/ui/primitives";

function Compass() {
  const bearing = useMapTelemetry((s) => s.bearing);
  const sendMap = useApp((s) => s.sendMap);
  return (
    <Tooltip label="Reset north" side="left">
      <Pressable onClick={() => sendMap("north")} aria-label="Reset north" className="grid h-11 w-11 place-items-center rounded-full glass liquid">
        <motion.div animate={{ rotate: -bearing }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
          <svg width="22" height="22" viewBox="0 0 22 22">
            <path d="M11 2 L14 11 L8 11 Z" fill="#ff453a" />
            <path d="M11 20 L8 11 L14 11 Z" fill="rgba(255,255,255,0.75)" />
            <circle cx="11" cy="11" r="1.6" fill="#111" />
          </svg>
        </motion.div>
      </Pressable>
    </Tooltip>
  );
}

function LayerPicker() {
  const layerId = useApp((s) => s.layer);
  const setLayer = useApp((s) => s.setLayer);
  const notify = useApp((s) => s.notify);
  const focus = useApp((s) => s.focusPlace);
  const [open, setOpen] = useState(false);
  const l = layerById(layerId);
  const p = placeById(focus ?? "aral");
  return (
    <div className="relative">
      <Pressable onClick={() => setOpen((o) => !o)} className="flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-4 glass liquid">
        <motion.span key={l.id} initial={{ scale: 0.6, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} className="h-8 w-8 rounded-full ring-1 ring-inset ring-white/25" style={{ background: l.swatch }} />
        <span className="text-left leading-tight">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/45">Layer</span>
          <span className="block text-[13px] font-semibold">{l.name}</span>
        </span>
        <Layers size={15} className="ml-1 text-white/45" />
      </Pressable>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(360px,calc(100vw-24px))] p-2.5">
        <div className="px-1.5 pb-2 pt-1 text-[12px] font-semibold text-white/45">Imagery layers · NASA GIBS</div>
        <div className="grid grid-cols-2 gap-2">
          {LAYERS.map((L) => {
            const active = L.id === layerId;
            const d = L.id === "viirs" ? withYearMonth(p.after, Math.max(2019, yearOf(p.after))) : p.after;
            return (
              <motion.button
                key={L.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setLayer(L.id);
                  setOpen(false);
                  notify({ title: L.name, subtitle: `${L.sensor} · ${L.resolution}`, icon: "layers", tone: "blue" });
                }}
                className={cn(
                  "group relative overflow-hidden rounded-[16px] text-left ring-2 transition-shadow",
                  active ? "ring-ios-blue" : "ring-transparent hover:ring-white/20"
                )}
              >
                <SatImage
                  lazy
                  showIcon={false}
                  src={snapshotUrl({ layer: L.id, date: d, lat: p.lat, lon: p.lon, span: p.span, width: 320, height: 200 })}
                  className="h-[92px] w-full"
                  imgClassName="transition-transform duration-700 group-hover:scale-105"
                />
                <div className="bg-white/[0.04] px-2.5 py-2">
                  <div className="text-[12.5px] font-semibold">{L.name}</div>
                  <div className="truncate text-[11px] text-white/45">
                    {L.sensor} · {L.resolution}
                  </div>
                </div>
                {active && (
                  <motion.span layoutId="layer-check" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-ios-blue shadow-lg">
                    <Check size={14} strokeWidth={3} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
        <p className="px-1.5 pt-2.5 text-[11.5px] leading-snug text-white/40">{l.description}</p>
      </Popover>
    </div>
  );
}

function FocusChip() {
  const focus = useApp((s) => s.focusPlace);
  const setPalette = useApp((s) => s.setPalette);
  const p = focus ? placeById(focus) : null;
  return (
    <Pressable onClick={() => setPalette(true)} className="hidden h-11 items-center gap-2 overflow-hidden rounded-full pl-1.5 pr-4 glass liquid sm:flex">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={p?.id ?? "earth"}
          initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -14, filter: "blur(4px)" }}
          className="flex items-center gap-2"
        >
          {p ? (
            <CategoryIcon category={p.category} size={32} />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-b from-ios-teal to-ios-blue">
              <Globe size={16} />
            </span>
          )}
          <span className="text-left leading-tight">
            <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{p ? "Focused" : "Viewing"}</span>
            <span className="block text-[13px] font-semibold">{p ? p.name : "Whole Earth"}</span>
          </span>
        </motion.span>
      </AnimatePresence>
    </Pressable>
  );
}

const inspectorRow = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 320, damping: 28 } },
} as const;

function PlaceInspector({ id }: { id: string }) {
  const p = usePlace(id);
  const series = useSeries(id);
  const t = trendOf(p, series?.rows);
  const tg = targetOf(p.target);
  useEffect(() => void useApp.getState().ensureSeries(id), [id]);
  const selectPlace = useApp((s) => s.selectPlace);
  const clearFocus = useApp((s) => s.clearFocus);
  const watchlist = useApp((s) => s.watchlist);
  const toggleWatch = useApp((s) => s.toggleWatch);
  const notify = useApp((s) => s.notify);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const watching = watchlist.includes(id);
  const [burst, setBurst] = useState(0);
  const hd = useApp((s) => s.settings.hdImagery);
  // The inspector's two buttons lead to Compare/Timelapse — warm that imagery.
  useEffect(() => warmCompareWhenIdle(p, hd), [p, hd]);
  return (
    <motion.div
      initial={{ opacity: 0, x: -30, scale: 0.96, filter: "blur(8px)" }}
      animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      exit={{ opacity: 0, x: -24, scale: 0.97, filter: "blur(6px)", transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        "pointer-events-auto absolute bottom-[172px] left-3 right-3 z-20 overflow-hidden rounded-[28px] glass-strong transition-[left] duration-500 ease-apple sm:right-auto sm:w-[360px] lg:bottom-[104px]",
        sidebarOpen ? "lg:left-[292px]" : "lg:left-4"
      )}
    >
      <motion.div layoutId={stageId(p.id)} transition={morphTransition} style={{ borderRadius: 0 }} className="relative h-[140px] overflow-hidden sm:h-[156px]">
        <SatImage src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 720, height: 312 })} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d21] via-transparent to-transparent" />
        <button onClick={clearFocus} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full glass transition-transform active:scale-90">
          <X size={15} />
        </button>
        <div className="absolute left-3 top-3">
          <StatusBadge status={p.status} className="backdrop-blur-md" />
        </div>
      </motion.div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } }}
        className="-mt-6 px-4 pb-4"
      >
        <motion.div variants={inspectorRow} className="relative flex items-center gap-2.5">
          <motion.span initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.15 }}>
            <CategoryIcon category={p.category} size={36} />
          </motion.span>
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-bold tracking-tight">{p.name}</h3>
            <p className="truncate text-[12.5px] text-white/50">{p.region}</p>
          </div>
        </motion.div>
        <motion.p variants={inspectorRow} className="mt-3 hidden text-[13px] leading-relaxed text-white/65 sm:block">
          {p.headline}.
        </motion.p>
        <motion.div variants={inspectorRow} className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-[16px] bg-white/[0.05] p-3">
            <div className="text-[11px] font-medium text-white/45">{tg.label}{t.last ? ` · ${t.last.year}` : ""}</div>
            <div className="text-[17px] font-bold tabular-nums">{t.last ? fmtKm2(t.last.value) : series?.status === "loading" ? "Measuring…" : "—"}</div>
          </div>
          <div className="rounded-[16px] bg-white/[0.05] p-3">
            <div className="text-[11px] font-medium text-white/45">{t.first ? `Since ${t.first.year}` : "Trend"}</div>
            <div className="text-[17px] font-bold" style={{ color: t.total == null ? "#fff" : t.total >= 0 === goodWhenUp(p) ? "#30d158" : "#ff6961" }}>
              {t.total == null ? "—" : <RollingNumber value={Math.round(t.total)} signed suffix="%" />}
            </div>
          </div>
        </motion.div>
        <motion.div variants={inspectorRow} className="mt-3 flex gap-2">
          <Button variant="primary" size="sm" icon={Columns2} className="flex-1" onClick={() => selectPlace(id, "compare")}>
            Compare
          </Button>
          <Button size="sm" icon={Film} className="flex-1" onClick={() => selectPlace(id, "timelapse")}>
            Timelapse
          </Button>
          <span className="relative inline-flex">
          <Burst trigger={burst} color="#30d158" />
          <IconButton
            icon={watching ? BookmarkCheck : Bookmark}
            label={watching ? "Remove from watchlist" : "Add to watchlist"}
            size="sm"
            active={watching}
            tooltipSide="top"
            onClick={() => {
              if (!watching) setBurst((b) => b + 1);
              toggleWatch(id);
              notify({
                title: watching ? "Removed from Watchlist" : "Added to Watchlist",
                subtitle: p.name,
                icon: "bookmark",
                tone: watching ? "orange" : "green",
              });
            }}
          />
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function TimelineBar() {
  const layerId = useApp((s) => s.layer);
  const date = useApp((s) => s.exploreDate);
  const setDate = useApp((s) => s.setExploreDate);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const notify = useApp((s) => s.notify);
  const loading = useMapTelemetry((s) => s.loading);
  const [preview, setPreview] = useState(date);
  const [playing, setPlaying] = useState(false);
  const l = layerById(layerId);
  const max = latestISO();
  const min = l.minDate;

  useEffect(() => setPreview(date), [date]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      const d = useApp.getState().exploreDate;
      if (d >= max) {
        setPlaying(false);
        return;
      }
      useApp.getState().setExploreDate(addDays(d, 1));
    }, 1500);
    return () => window.clearInterval(t);
  }, [playing, max]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || pageShortcutBlocked(e)) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const stepYear = (n: number) => {
    let d = withYearMonth(date, yearOf(date) + n);
    if (d > max) d = max;
    if (d < min) d = min;
    setDate(d);
    notify({ title: fmtDate(d, "medium"), subtitle: `${l.name} · streaming tiles`, icon: "satellite", tone: "teal", progress: true, duration: 1800 });
  };

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.15 }}
      className={cn(
        "pointer-events-auto absolute bottom-[88px] left-3 right-3 z-20 transition-[left] duration-500 ease-apple lg:bottom-4 lg:right-4",
        sidebarOpen ? "lg:left-[292px]" : "lg:left-4"
      )}
    >
      <div className="mx-auto flex max-w-[1000px] items-center gap-2 rounded-[30px] p-2 glass liquid sm:gap-3">
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => {
            if (playing) sfx.pause();
            else sfx.play();
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pause" : "Play daily imagery"}
          className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black shadow-[0_8px_24px_-8px_rgba(255,255,255,0.55)]", playing && "halo-playing")}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={playing ? "pause" : "play"}
              initial={{ scale: 0.3, opacity: 0, rotate: -60 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.3, opacity: 0, rotate: 60 }}
              transition={{ type: "spring", stiffness: 520, damping: 24 }}
            >
              {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="translate-x-[1px]" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <div className="w-[108px] shrink-0 sm:w-[128px]">
          <div className="text-[15px] font-semibold tabular-nums tracking-tight sm:text-[16px]">{fmtDate(preview, "medium")}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/45">
            {loading ? (
              <>
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-white/20 border-t-ios-teal" /> Streaming
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-ios-green" /> {l.short}
              </>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <TimeRuler date={date} min={min} max={max} onChange={setDate} onPreview={setPreview} />
        </div>
        <div className="hidden shrink-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-1 sm:flex">
          <IconButton icon={ChevronLeft} label="Previous year" variant="plain" size="sm" onClick={() => stepYear(-1)} tooltipSide="top" />
          <span className="w-10 text-center text-[13px] font-semibold tabular-nums">{yearOf(preview)}</span>
          <IconButton icon={ChevronRight} label="Next year" variant="plain" size="sm" onClick={() => stepYear(1)} tooltipSide="top" />
        </div>
        <button
          onClick={() => setDate(max)}
          className={cn(
            "hidden h-9 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors md:block",
            date === max ? "text-white/30" : "bg-ios-blue/15 text-[#4aa3ff] hover:bg-ios-blue/25"
          )}
        >
          Latest
        </button>
      </div>
    </motion.div>
  );
}

/** Says plainly which part of the picture is not from the selected day. */
function FillNote() {
  const fills = useMapTelemetry((s) => s.fills);
  const date = useApp((s) => s.exploreDate);
  // Only the pole that is actually dark on this date is showing older imagery.
  const md = date.slice(5);
  const dark = md >= "09-23" || md < "03-21" ? "north" : "south";
  const f = fills.find((x) => x.pole === dark);
  return (
    <div className="absolute bottom-[164px] right-4 z-10 hidden max-w-[46ch] text-right text-[10.5px] leading-snug text-white/35 lg:bottom-[100px] lg:block">
      Imagery: NASA GIBS.{" "}
      {f ? `The ${dark === "north" ? "Arctic" : "Antarctic"} is in polar night; it shows the last fully sunlit pass, ${fmtDate(f.date, "medium")}.` : "Areas with no pass that day show NASA Blue Marble."}
    </div>
  );
}

export function Explore() {
  const focus = useApp((s) => s.focusPlace);
  const sendMap = useApp((s) => s.sendMap);
  const clearFocus = useApp((s) => s.clearFocus);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const pin = useApp((s) => s.pin);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 5000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        initial={{ y: -22, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.05 }}
        className={cn(
          "pointer-events-auto absolute left-3 top-[64px] z-30 flex items-center gap-2 transition-[left] duration-500 ease-apple sm:top-[68px]",
          sidebarOpen ? "lg:left-[292px]" : "lg:left-4"
        )}
      >
        <LayerPicker />
        <FocusChip />
      </motion.div>

      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
        className="pointer-events-auto absolute right-3 top-[124px] z-20 flex flex-col items-center gap-2 sm:right-4 lg:top-1/2 lg:-translate-y-1/2"
      >
        <div className="flex flex-col items-center rounded-full p-1 glass liquid">
          <IconButton icon={Plus} label="Zoom in" variant="plain" tooltipSide="left" onClick={() => sendMap("zoomIn")} />
          <span className="h-px w-5 bg-white/10" />
          <IconButton icon={Minus} label="Zoom out" variant="plain" tooltipSide="left" onClick={() => sendMap("zoomOut")} />
        </div>
        <IconButton
          icon={LocateFixed}
          label="Whole Earth"
          tooltipSide="left"
          className="h-11 w-11"
          onClick={() => {
            clearFocus();
            sendMap("home");
          }}
        />
      </motion.div>

      <AnimatePresence mode="wait">{focus && <PlaceInspector key={focus} id={focus} />}</AnimatePresence>

      <AnimatePresence>
        {pin && !focus && (
          <motion.div
            key={`${pin.lat},${pin.lon}`}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className={cn(
              "pointer-events-auto absolute bottom-[172px] left-3 right-3 z-20 rounded-[24px] p-4 glass-strong transition-[left] duration-500 ease-apple sm:right-auto sm:w-[360px] lg:bottom-[104px]",
              sidebarOpen ? "lg:left-[292px]" : "lg:left-4"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{pin.event ? pin.event.categoryLabel : "Not in your library"}</div>
                <h3 className="truncate text-[17px] font-bold tracking-tight">{pin.name || "Dropped pin"}</h3>
                <p className="text-[12.5px] tabular-nums text-white/50">
                  {Math.abs(pin.lat).toFixed(2)}°{pin.lat >= 0 ? "N" : "S"} · {Math.abs(pin.lon).toFixed(2)}°{pin.lon >= 0 ? "E" : "W"}
                  {pin.event ? ` · updated ${fmtDate(pin.event.date, "medium")}` : ""}
                </p>
              </div>
              <button onClick={clearFocus} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10">
                <X size={15} />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" className="flex-1" onClick={() => useApp.getState().setAddPlace({ name: pin.name, region: pin.region, lat: pin.lat, lon: pin.lon, span: pin.event ? 2 : pin.span })}>
                Track this place
              </Button>
              <Button size="sm" className="flex-1" onClick={() => useApp.getState().setAnalyst(true, `What changed at ${pin.lat.toFixed(3)}, ${pin.lon.toFixed(3)} since 2005?`)}>
                Ask what changed
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hint && !focus && !pin && (
          <motion.div
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-[172px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-medium text-white/75 glass lg:bottom-[104px]"
          >
            Drag to spin · Scroll to zoom · Tap a pulse to fly there
          </motion.div>
        )}
      </AnimatePresence>

      <TimelineBar />
      <FillNote />
    </div>
  );
}
