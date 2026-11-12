import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Activity, Aperture, ArrowLeftRight, ChevronLeft, ChevronRight, CloudSun, Columns2, Film, MapPin, Satellite, Sparkles } from "lucide-react";
import { TiltCard } from "@/components/ui/motion";
import { warmCompare, warmCompareWhenIdle } from "@/lib/warm";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { SATELLITES, changePct, placeById } from "@/data/places";
import { fmtDate, snapshotUrl, todayISO, yearOf } from "@/lib/gibs";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { CompareStage, morphTransition, stageId } from "@/components/CompareStage";
import { GlobeCSS } from "@/components/GlobeCSS";
import { SatImage } from "@/components/ui/SatImage";
import { Item, RollingNumber, Stagger, useNow } from "@/components/ui/motion";
import { Rings, Sparkline } from "@/components/ui/charts";
import { Button, CategoryIcon, ChangePill, IconButton, SectionHeader, StatusBadge, goodWhenUp, spring } from "@/components/ui/primitives";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function FeaturedCard() {
  const selectPlace = useApp((s) => s.selectPlace);
  const hd = useApp((s) => s.settings.hdImagery);
  const p = placeById("aral");
  const [w, h] = hd ? [1440, 810] : [1024, 576];
  const common = { layer: p.layer, lat: p.lat, lon: p.lon, span: p.span, width: w, height: h };
  const before = snapshotUrl({ ...common, date: p.before });
  const after = snapshotUrl({ ...common, date: p.after });
  const pct = changePct(p, yearOf(p.before), yearOf(p.after));
  // The hero's buttons lead to Compare — have its full-size imagery ready.
  useEffect(() => warmCompareWhenIdle(p, hd), [p, hd]);
  return (
    <div className="card relative h-[440px] overflow-hidden sm:h-[500px]">
      <CompareStage
        before={before}
        after={after}
        beforeLabel="2000"
        afterLabel="2018"
        loop
        labels={false}
        priority
        className="absolute inset-0"
        rounded="rounded-[26px]"
        layoutId={stageId(p.id)}
        radius={26}
      />
      <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-t from-black/90 via-black/20 to-black/20" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 sm:left-5 sm:top-5">
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black">
          <Sparkles size={13} /> Featured change
        </span>
        <span className="hidden rounded-full px-3 py-1.5 text-[12px] font-semibold glass sm:inline">Terra · MODIS · 250 m</span>
      </div>
      <div className="pointer-events-none absolute right-5 top-5 hidden items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums glass sm:flex">
        2000 <ArrowLeftRight size={12} /> 2018
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-4 sm:inset-x-6 sm:bottom-6">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/70">
            <CategoryIcon category={p.category} size={22} /> {p.region}
          </div>
          <h2 className="mt-2.5 text-[30px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[42px]">The Aral Sea is vanishing</h2>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/65">{p.headline}. Drag the divider to travel two decades.</p>
          <div className="pointer-events-auto mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={Columns2} onClick={() => selectPlace("aral", "compare")}>
              Compare
            </Button>
            <Button icon={Film} onClick={() => selectPlace("aral", "timelapse")}>
              Watch timelapse
            </Button>
          </div>
        </div>
        <div className="text-right">
          <RollingNumber value={Math.round(pct)} suffix="%" className="text-[56px] font-bold tracking-[-0.045em] sm:text-[72px]" />
          <div className="text-[13px] font-medium text-white/55">surface water since 2000</div>
        </div>
      </div>
    </div>
  );
}

function EarthNowCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((v) => (v + 1) % SATELLITES.length), 3200);
    return () => window.clearInterval(t);
  }, []);
  const s = SATELLITES[i];
  return (
    <TiltCard intensity={4} glare={false} className="card flex h-full min-h-[500px] flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold text-white/45">Earth now</div>
          <div className="text-[19px] font-bold tracking-tight">5 satellites imaging</div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-ios-green/15 px-2.5 py-1 text-[11.5px] font-semibold text-ios-green">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-ios-green" /> Live
        </span>
      </div>
      <div className="relative -mx-5 flex flex-1 items-center justify-center">
        <GlobeCSS size={200} />
      </div>
      <div className="relative h-[56px] overflow-hidden rounded-[18px] bg-white/[0.05] px-3.5 ring-1 ring-inset ring-white/[0.05]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={s.id}
            initial={{ y: 30, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -30, opacity: 0, filter: "blur(4px)" }}
            transition={spring}
            className="flex h-[56px] items-center gap-3"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[11px]" style={{ background: `${s.color}26` }}>
              <Satellite size={17} style={{ color: s.color }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">
                {s.name} <span className="font-normal text-white/45">· {s.instrument}</span>
              </div>
              <div className="truncate text-[12px] text-white/50">
                {s.status} over {s.over}
              </div>
            </div>
            <span className="flex items-center gap-1">
              {SATELLITES.map((_, j) => (
                <motion.span
                  key={j}
                  animate={{ width: j === i ? 12 : 4, opacity: j === i ? 1 : 0.35 }}
                  transition={spring}
                  className="h-1 rounded-full bg-white"
                />
              ))}
            </span>
          </motion.div>
        </AnimatePresence>
        <motion.span
          key={s.id}
          className="absolute bottom-0 left-0 h-[2px] rounded-full"
          style={{ background: s.color }}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 3.2, ease: "linear" }}
        />
      </div>
    </TiltCard>
  );
}

function HealthCard() {
  const items = [
    { label: "Coverage", value: 0.87, from: "#ff375f", to: "#ff8aa5", sub: "7 of 8 places imaged" },
    { label: "Clear skies", value: 0.64, from: "#b4ff39", to: "#30d158", sub: "Cloud-free observations" },
    { label: "Reviewed", value: 0.75, from: "#64d2ff", to: "#0a84ff", sub: "9 of 12 alerts triaged" },
  ];
  return (
    <div className="card h-full p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-white/45">Monitoring</div>
          <div className="text-[19px] font-bold tracking-tight">Today’s health</div>
        </div>
        <Activity size={18} className="text-white/30" />
      </div>
      <div className="flex items-center gap-5">
        <Rings rings={items} size={150} stroke={15} />
        <div className="min-w-0 flex-1 space-y-3">
          {items.map((it) => (
            <div key={it.label}>
              <div className="text-[12px] font-semibold" style={{ color: it.from }}>
                {it.label}
              </div>
              <RollingNumber value={Math.round(it.value * 100)} suffix="%" className="text-[22px] font-bold tracking-tight" />
              <div className="truncate text-[11.5px] text-white/40">{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STATS = [
  { label: "Places tracked", value: 8, suffix: "", icon: MapPin, color: "#64d2ff", delta: "+2 this month", spark: [3, 4, 4, 5, 6, 6, 7, 8] },
  { label: "Changes detected", value: 23, suffix: "", icon: Activity, color: "#bf5af2", delta: "+12% vs last month", spark: [8, 11, 9, 14, 12, 17, 19, 23] },
  { label: "Frames analysed", value: 12480, suffix: "", icon: Aperture, color: "#ff9f0a", delta: "1,284 today", spark: [4, 6, 5, 8, 9, 11, 10, 12.5] },
  { label: "Cloud-free rate", value: 64, suffix: "%", icon: CloudSun, color: "#30d158", delta: "+5 pts this week", spark: [52, 55, 51, 58, 60, 57, 62, 64] },
];

function StatTiles() {
  return (
    <div className="grid h-full grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-2">
      {STATS.map((s, i) => {
        const Icon = s.icon;
        return (
          <motion.div
            key={s.label}
            initial="rest"
            whileHover="hover"
            whileTap={{ scale: 0.985 }}
            variants={{ rest: { y: 0 }, hover: { y: -3 } }}
            transition={spring}
            className="card flex flex-col justify-between gap-3 p-4"
          >
            <div className="flex items-center justify-between">
              <motion.span
                variants={{ rest: { scale: 1, rotate: 0 }, hover: { scale: 1.15, rotate: -8 } }}
                transition={{ type: "spring", stiffness: 500, damping: 16 }}
                className="grid h-8 w-8 place-items-center rounded-[10px]"
                style={{ background: `${s.color}22`, boxShadow: `0 0 0 0 ${s.color}00` }}
              >
                <Icon size={16} style={{ color: s.color }} />
              </motion.span>
              <motion.span variants={{ rest: { y: 0, opacity: 0.85 }, hover: { y: -2, opacity: 1 } }}>
                <Sparkline values={s.spark} color={s.color} width={68} height={24} strokeWidth={1.8} delay={0.4 + i * 0.1} />
              </motion.span>
            </div>
            <div>
              <RollingNumber value={s.value} suffix={s.suffix} className="text-[28px] font-bold tracking-[-0.03em]" />
              <div className="text-[12.5px] font-medium text-white/60">{s.label}</div>
              <div className="mt-0.5 text-[11.5px] text-white/35">{s.delta}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function RecentChanges() {
  const selectPlace = useApp((s) => s.selectPlace);
  const hd = useApp((s) => s.settings.hdImagery);
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  const items = ["mead", "aral", "rondonia", "sindh", "urmia", "marshes", "nsw", "saltlake"].map(placeById);
  return (
    <div>
      <SectionHeader
        title="Recent changes"
        action={
          <div className="flex gap-1.5">
            <IconButton icon={ChevronLeft} label="Previous" size="sm" onClick={() => scroll(-1)} />
            <IconButton icon={ChevronRight} label="Next" size="sm" onClick={() => scroll(1)} />
          </div>
        }
      />
      <div ref={scroller} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 pt-1 sm:-mx-8 sm:px-8">
        {items.map((p) => {
          const pct = changePct(p, yearOf(p.before), yearOf(p.after));
          return (
            <motion.button
              key={p.id}
              layoutId={p.id === "aral" ? undefined : stageId(p.id)}
              onPointerEnter={() => warmCompare(p, hd)}
              onClick={() => selectPlace(p.id, "compare")}
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              transition={{ ...spring, ...morphTransition }}
              style={{ borderRadius: 24 }}
              className="group relative h-[236px] w-[292px] shrink-0 snap-start overflow-hidden rounded-[24px] text-left ring-1 ring-white/[0.08]"
            >
              <SatImage
                lazy
                src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 600, height: 480 })}
                className="absolute inset-0"
                imgClassName="transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/10" />
              <div className="absolute left-3 top-3">
                <StatusBadge status={p.status} className="backdrop-blur-md" />
              </div>
              <span className="absolute right-3 top-3 rounded-full px-2 py-1 text-[11px] font-medium text-white/80 glass">{p.lastPass}</span>
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold tracking-tight">{p.name}</div>
                  <div className="truncate text-[12px] text-white/55">
                    {p.metric.label} · {yearOf(p.before)}–{yearOf(p.after)}
                  </div>
                </div>
                <ChangePill value={pct} goodWhenUp={goodWhenUp(p.category)} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function WatchlistCard() {
  const watchlist = useApp((s) => s.watchlist);
  const selectPlace = useApp((s) => s.selectPlace);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="card h-full p-2">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <h3 className="text-[17px] font-bold tracking-tight">Watchlist</h3>
        <span className="text-[12px] text-white/40">{watchlist.length} places</span>
      </div>
      <div onPointerLeave={() => setHover(null)}>
        {watchlist.map((id) => {
          const p = placeById(id);
          const series = p.metric.series.map((s) => s.value);
          const last = series[series.length - 1];
          const pct = changePct(p, p.years[0], p.years[1]);
          return (
            <button
              key={id}
              onPointerEnter={() => setHover(id)}
              onClick={() => selectPlace(id, "explore")}
              className="relative flex w-full items-center gap-3 rounded-[18px] p-2.5 text-left"
            >
              {hover === id && <motion.span layoutId="watch-hover" className="absolute inset-0 rounded-[18px] bg-white/[0.06]" transition={spring} />}
              <SatImage
                lazy
                showIcon={false}
                src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 160, height: 160 })}
                className={cn("relative h-12 w-12 shrink-0 rounded-[14px] transition-transform duration-500 ease-apple", hover === id && "scale-110 -rotate-2")}
              />
              <div className="relative min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{p.name}</div>
                <div className="truncate text-[12px] text-white/45">{p.region}</div>
              </div>
              <Sparkline values={series} color={p.color} width={90} height={30} className="relative hidden sm:block" />
              <div className="relative w-[104px] text-right">
                <div className="text-[14px] font-semibold tabular-nums">
                  {last.toLocaleString("en-US", { maximumFractionDigits: p.metric.decimals })}{" "}
                  <span className="text-[11px] font-medium text-white/45">{p.metric.unit}</span>
                </div>
                <ChangePill value={pct} goodWhenUp={goodWhenUp(p.category)} className="mt-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConstellationCard() {
  const now = useNow(1000);
  const start = useRef(Date.now());
  return (
    <div className="card h-full p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-bold tracking-tight">Constellation</h3>
        <span className="text-[12px] text-white/40">Sun-synchronous orbits</span>
      </div>
      <div className="space-y-4">
        {SATELLITES.map((s) => {
          const elapsed = (now - start.current) / 1000;
          const phase = (s.phase + (elapsed / (s.period * 60)) * 12) % 1;
          const sc = s.status === "Imaging" ? "#30d158" : s.status === "Downlink" ? "#0a84ff" : "#8e8e93";
          return (
            <div key={s.id} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: `${s.color}22` }}>
                <Satellite size={17} style={{ color: s.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold">
                    {s.name} <span className="font-normal text-white/40">{s.instrument}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium" style={{ color: sc }}>
                    <span className={s.status === "Imaging" ? "h-1.5 w-1.5 animate-blink rounded-full" : "h-1.5 w-1.5 rounded-full"} style={{ background: sc }} />
                    {s.status}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                    style={{ width: `${phase * 100}%`, background: `linear-gradient(90deg, ${s.color}44, ${s.color})` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/35">
                  <span>Over {s.over}</span>
                  <span>In orbit since {s.launched}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Today() {
  const notify = useApp((s) => s.notify);

  useEffect(() => {
    if (sessionStorage.getItem("epoch-synced")) return;
    const t1 = window.setTimeout(() => {
      sessionStorage.setItem("epoch-synced", "1");
      notify({ title: "Syncing with NASA GIBS", subtitle: "Checking 8 places for new passes", icon: "satellite", tone: "teal", progress: true, duration: 2500 });
    }, 2900);
    const t2 = window.setTimeout(
      () => notify({ title: "3 new changes detected", subtitle: "Lake Mead · Aral Sea · Rondônia", icon: "sparkles", tone: "purple", duration: 3400 }),
      5700
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [notify]);

  return (
    <ViewScroll
      eyebrow={fmtDate(todayISO(), "long")}
      title={`${greeting()}, Jordan`}
      subtitle="Three places changed since your last visit."
      actions={
        <Button
          icon={Sparkles}
          onClick={() => notify({ title: "Daily brief ready", subtitle: "3 changes · 1 new cloud-free pass", icon: "sparkles", tone: "purple" })}
        >
          Daily brief
        </Button>
      }
    >
      <Stagger className="grid grid-cols-12 gap-4 lg:gap-5">
        <Item className="col-span-12 xl:col-span-8">
          <FeaturedCard />
        </Item>
        <Item className="col-span-12 md:col-span-6 xl:col-span-4">
          <EarthNowCard />
        </Item>
        <Item className="col-span-12 md:col-span-6 xl:col-span-5">
          <HealthCard />
        </Item>
        <Item className="col-span-12 xl:col-span-7">
          <StatTiles />
        </Item>
        <Item className="col-span-12 mt-3">
          <RecentChanges />
        </Item>
        <Item className="col-span-12 xl:col-span-7">
          <WatchlistCard />
        </Item>
        <Item className="col-span-12 xl:col-span-5">
          <ConstellationCard />
        </Item>
      </Stagger>
    </ViewScroll>
  );
}
