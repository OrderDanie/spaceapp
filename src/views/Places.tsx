import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { OverlayPortal } from "@/components/OverlayPortal";
import { Burst } from "@/components/ui/Burst";
import { prefetchImages } from "@/lib/imageCache";
import { Bookmark, BookmarkCheck, ChevronRight, Columns2, Earth, Film, LayoutGrid, List, Plus, X } from "lucide-react";
import { useApp } from "@/store";
import { PLACES, changePct, placeById, type Place } from "@/data/places";
import { snapshotUrl, yearOf } from "@/lib/gibs";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { CompareStage, stageId } from "@/components/CompareStage";
import { SatImage } from "@/components/ui/SatImage";
import { LineChart, Sparkline } from "@/components/ui/charts";
import { TiltCard } from "@/components/ui/motion";
import { Button, CategoryIcon, ChangePill, SegmentedControl, StatusBadge, goodWhenUp, spring } from "@/components/ui/primitives";

const FILTERS = ["All", "Water", "Forest", "Fire", "Flood", "Wetland"] as const;
type Filter = (typeof FILTERS)[number];

const img = (p: Place, date: string, w = 960, h = 600) => snapshotUrl({ layer: p.layer, date, lat: p.lat, lon: p.lon, span: p.span, width: w, height: h });
const fmtV = (p: Place, v: number) => v.toLocaleString("en-US", { maximumFractionDigits: p.metric.decimals });

function PlaceCard({ p, onOpen }: { p: Place; onOpen: () => void }) {
  const watching = useApp((s) => s.watchlist.includes(p.id));
  const pct = changePct(p, p.years[0], p.years[1]);
  return (
    <TiltCard intensity={6} className="rounded-[26px]" onClick={onOpen} onPointerEnter={() => prefetchImages([img(p, p.before)])}>
      <motion.div layoutId={`card-${p.id}`} className="card relative cursor-pointer overflow-hidden bg-[#141416]" style={{ borderRadius: 26 }}>
        <motion.div layoutId={`img-${p.id}`} className="relative h-[210px] overflow-hidden">
          <SatImage lazy src={img(p, p.after)} className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141416] via-transparent to-transparent" />
          <div className="absolute left-3 top-3">
            <StatusBadge status={p.status} className="backdrop-blur-md" />
          </div>
          {watching && (
            <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full glass">
              <BookmarkCheck size={13} className="text-ios-orange" />
            </span>
          )}
        </motion.div>
        <div className="relative -mt-8 px-4 pb-4">
          <div className="flex items-end justify-between gap-2">
            <CategoryIcon category={p.category} size={42} />
            <Sparkline values={p.metric.series.map((s) => s.value)} color={p.color} width={100} height={30} />
          </div>
          <h3 className="mt-3 text-[18px] font-bold tracking-tight">{p.name}</h3>
          <p className="text-[12.5px] text-white/50">{p.region}</p>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-3">
            <span className="text-[12px] text-white/45">
              {p.metric.label} · since {p.years[0]}
            </span>
            <ChangePill value={pct} goodWhenUp={goodWhenUp(p.category)} />
          </div>
        </div>
      </motion.div>
    </TiltCard>
  );
}

function PlaceRow({ p, onOpen }: { p: Place; onOpen: () => void }) {
  const pct = changePct(p, p.years[0], p.years[1]);
  const latest = p.metric.series[p.metric.series.length - 1].value;
  return (
    <button onClick={onOpen} className="card group flex w-full items-center gap-4 p-3 text-left transition-colors hover:bg-white/[0.06]" style={{ borderRadius: 22 }}>
      <SatImage lazy showIcon={false} src={img(p, p.after, 200, 200)} className="h-14 w-14 shrink-0 rounded-[16px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{p.name}</span>
          <StatusBadge status={p.status} className="hidden sm:inline-flex" />
        </div>
        <div className="truncate text-[12.5px] text-white/45">
          {p.region} · {p.category}
        </div>
      </div>
      <Sparkline values={p.metric.series.map((s) => s.value)} color={p.color} width={110} height={32} className="hidden md:block" />
      <div className="hidden w-28 text-right sm:block">
        <div className="text-[14px] font-semibold tabular-nums">
          {fmtV(p, latest)} <span className="text-[11px] text-white/45">{p.metric.unit}</span>
        </div>
        <div className="truncate text-[11.5px] text-white/40">{p.metric.label}</div>
      </div>
      <ChangePill value={pct} goodWhenUp={goodWhenUp(p.category)} />
      <ChevronRight size={16} className="text-white/30 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function PlaceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const p = placeById(id);
  const selectPlace = useApp((s) => s.selectPlace);
  const watching = useApp((s) => s.watchlist.includes(id));
  const toggleWatch = useApp((s) => s.toggleWatch);
  const notify = useApp((s) => s.notify);
  const pct = changePct(p, p.years[0], p.years[1]);
  const latest = p.metric.series[p.metric.series.length - 1].value;

  const closeRef = useRef<HTMLButtonElement>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const s = useApp.getState();
      // Let Spotlight / Settings consume Escape first when they're on top.
      if (e.key === "Escape" && !s.paletteOpen && !s.settingsOpen) onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // Move focus into the sheet, and give it back to the card on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 320);
    return () => {
      window.clearTimeout(t);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  const go = (view: "compare" | "timelapse" | "explore") => {
    onClose();
    window.setTimeout(() => selectPlace(id, view), 120);
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[85] bg-black/55 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <div
        data-epoch-modal
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        className="pointer-events-none fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-8"
      >
        <motion.div
          layoutId={`card-${id}`}
          transition={{ type: "spring", stiffness: 280, damping: 32 }}
          className="pointer-events-auto relative flex max-h-full w-full max-w-[940px] flex-col overflow-hidden bg-[#141416] shadow-[0_40px_120px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
          style={{ borderRadius: 32 }}
        >
          <motion.div layoutId={`img-${id}`} className="relative h-[250px] shrink-0 overflow-hidden sm:h-[380px]">
            <CompareStage
              before={img(p, p.before)}
              after={img(p, p.after)}
              beforeLabel={String(yearOf(p.before))}
              afterLabel={String(yearOf(p.after))}
              autoSweep
              className="absolute inset-0"
              rounded="rounded-none"
              layoutId={stageId(id)}
              radius={0}
            />
          </motion.div>
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: { delay: 0.2 } }}
            exit={{ opacity: 0, scale: 0.6 }}
            ref={closeRef}
            whileTap={{ scale: 0.88 }}
            whileHover={{ rotate: 90 }}
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-14 z-30 grid h-9 w-9 place-items-center rounded-full glass-strong sm:top-4"
          >
            <X size={17} />
          </motion.button>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.16, type: "spring", stiffness: 260, damping: 28 } }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.12 } }}
            className="scroll-area min-h-0 overflow-y-auto p-5 sm:p-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <CategoryIcon category={p.category} size={50} />
                <div>
                  <h2 className="text-[26px] font-bold tracking-tight">{p.name}</h2>
                  <p className="text-[14px] text-white/50">{p.region}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.status} />
                <ChangePill value={pct} goodWhenUp={goodWhenUp(p.category)} />
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-white/65">{p.summary}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [p.metric.label, `${fmtV(p, latest)} ${p.metric.unit}`],
                [`Since ${p.years[0]}`, `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`],
                ["Last pass", p.lastPass],
                ["Cloud cover", `${p.cloud}%`],
              ].map(([k, v], i) => (
                <motion.div
                  key={k}
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 340, damping: 26, delay: 0.24 + i * 0.05 }}
                  className="rounded-[16px] bg-white/[0.05] px-3.5 py-3"
                >
                  <div className="truncate text-[11.5px] font-medium text-white/45">{k}</div>
                  <div className="truncate text-[16px] font-semibold tabular-nums">{v}</div>
                </motion.div>
              ))}
            </div>
            <div className="mt-5 rounded-[22px] bg-white/[0.04] p-4">
              <div className="mb-1 text-[13px] font-semibold text-white/50">
                {p.metric.label} · {p.years[0]}–{p.years[1]}
              </div>
              <LineChart data={p.metric.series} color={p.color} height={180} unit={p.metric.unit} decimals={p.metric.decimals} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" icon={Columns2} onClick={() => go("compare")}>
                Compare
              </Button>
              <Button icon={Film} onClick={() => go("timelapse")}>
                Timelapse
              </Button>
              <Button icon={Earth} onClick={() => go("explore")}>
                Show on globe
              </Button>
              <span className="relative inline-flex">
                <Button
                  variant="tinted"
                  icon={watching ? BookmarkCheck : Bookmark}
                  onClick={() => {
                    if (!watching) setBurst((b) => b + 1);
                    toggleWatch(id);
                    notify({ title: watching ? "Removed from Watchlist" : "Added to Watchlist", subtitle: p.name, icon: "bookmark", tone: watching ? "orange" : "green" });
                  }}
                >
                  {watching ? "Watching" : "Watch"}
                </Button>
                <Burst trigger={burst} color="#ff9f0a" radius={44} />
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

export function Places() {
  const [filter, setFilter] = useState<Filter>("All");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  // Stable callback: an inline arrow re-subscribed the sheet's key listener every render.
  const close = useCallback(() => setOpenId(null), []);
  const setPalette = useApp((s) => s.setPalette);
  const list = PLACES.filter((p) => filter === "All" || p.category === filter);
  const critical = PLACES.filter((p) => p.status === "Critical").length;

  return (
    <ViewScroll
      eyebrow="Library"
      title="Places"
      subtitle={`${PLACES.length} locations · ${critical} critical`}
      actions={
        <>
          <SegmentedControl
            value={layout}
            onChange={setLayout}
            options={[
              { value: "grid", icon: LayoutGrid },
              { value: "list", icon: List },
            ]}
          />
          <Button variant="blue" icon={Plus} onClick={() => setPalette(true)}>
            Add place
          </Button>
        </>
      }
    >
      <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <SegmentedControl value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: f }))} />
      </div>

      <LayoutGroup>
        <motion.div layout className={layout === "grid" ? "relative grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "relative flex flex-col gap-2.5"}>
          <AnimatePresence mode="popLayout">
            {list.map((p, i) => (
              <motion.div
                key={`${layout}-${p.id}`}
                layout
                initial={{ opacity: 0, scale: 0.94, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 28, delay: i * 0.035 } }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)", transition: { duration: 0.2 } }}
                transition={spring}
              >
                {layout === "grid" ? <PlaceCard p={p} onOpen={() => setOpenId(p.id)} /> : <PlaceRow p={p} onOpen={() => setOpenId(p.id)} />}
              </motion.div>
            ))}
          </AnimatePresence>
          {layout === "grid" && (
            <motion.button
              layout
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
              onClick={() => setPalette(true)}
              className="grid min-h-[330px] place-items-center rounded-[26px] border-2 border-dashed border-white/[0.12] text-center transition-colors hover:border-white/25 hover:bg-white/[0.02]"
            >
              <div>
                <motion.span variants={{ hover: { rotate: 90, scale: 1.1 } }} transition={spring} className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/[0.08]">
                  <Plus size={24} />
                </motion.span>
                <div className="mt-3 text-[15px] font-semibold">Track a new place</div>
                <div className="mt-1 text-[12.5px] text-white/45">Any lake, forest, glacier or coastline</div>
              </div>
            </motion.button>
          )}
        </motion.div>

        <OverlayPortal>
          <AnimatePresence>{openId && <PlaceDetail key={openId} id={openId} onClose={close} />}</AnimatePresence>
        </OverlayPortal>
      </LayoutGroup>
    </ViewScroll>
  );
}
