import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Satellite, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/utils/cn";
import { seriesDates, useApp, usePlace, useSeries } from "@/store";
import { goodWhenUp, trendOf, valueInYear } from "@/lib/metrics";
import { fmtKm2, pct as pctOf, targetOf } from "@/lib/spectral";
import { LAYERS, fmtDate, layerById, snapshotUrl, type LayerId } from "@/lib/gibs";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { PlacePicker } from "@/components/PlacePicker";
import { morphTransition, stageId } from "@/components/CompareStage";
import { pageShortcutBlocked } from "@/lib/keyboard";
import { sfx } from "@/lib/sound";
import { LineChart } from "@/components/ui/charts";
import { Item, RollingNumber, Stagger } from "@/components/ui/motion";
import { ChangePill, IconButton, SegmentedControl, Spinner, spring } from "@/components/ui/primitives";

function ProgressRing({ value, size = 26 }: { value: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="white" strokeOpacity={0.15} strokeWidth={3} fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#64d2ff"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - value) }}
        transition={spring}
      />
    </svg>
  );
}

export function Timelapse() {
  const placeId = useApp((s) => s.placeId);
  const hd = useApp((s) => s.settings.hdImagery);
  const notify = useApp((s) => s.notify);
  const p = usePlace(placeId);
  const series = useSeries(p.id);
  const t = trendOf(p, series?.rows);
  const tg = targetOf(p.target);
  useEffect(() => void useApp.getState().ensureSeries(p.id), [p.id]);
  // Use each year's clearest day once the record is complete, so frames are not cloud.
  const settled = series?.status === "ready" ? series.rows : undefined;

  const [layer, setLayer] = useState<LayerId>(p.layer);
  const [speed, setSpeed] = useState<"0.5" | "1" | "2">("1");
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState({ cur: 0, prev: 0 });
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const autoStarted = useRef(false);
  const readyNotified = useRef(false);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => setLayer(p.layer), [p]);

  const [w, h] = hd ? [1200, 750] : [960, 600];
  const frames = useMemo(() => {
    const out: { year: number; date: string; url: string }[] = [];
    for (const d of seriesDates(p)) {
      const date = settled?.find((r) => r.date === d && r.quality !== "none")?.used_date ?? d;
      out.push({ year: Number(d.slice(0, 4)), date, url: snapshotUrl({ layer, date, lat: p.lat, lon: p.lon, span: p.span, width: w, height: h }) });
    }
    return out;
  }, [p, layer, w, h, settled]);
  const n = frames.length;

  // Clamp indices — frames can shrink for one render when the place changes.
  const ci = frame.cur < n ? frame.cur : 0;
  const pi = frame.prev < n ? frame.prev : 0;

  useEffect(() => {
    setFrame({ cur: 0, prev: 0 });
    setPlaying(false);
    autoStarted.current = false;
    readyNotified.current = false;
    notify({ title: `Loading ${frames.length} frames`, subtitle: `${p.name} · ${frames[0].year}–${frames[frames.length - 1].year}`, icon: "download", tone: "blue", progress: true, duration: 2200 });
  }, [frames, notify, p]);

  const loadedCount = frames.filter((f) => loaded[f.url]).length;
  const progress = loadedCount / n;

  useEffect(() => {
    if (!autoStarted.current && progress >= 0.5) {
      autoStarted.current = true;
      setPlaying(true);
    }
    if (!readyNotified.current && progress >= 1) {
      readyNotified.current = true;
      notify({ title: "Timelapse ready", subtitle: `${n} years of ${p.name}`, icon: "check", tone: "green" });
    }
  }, [progress, n, p, notify]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setFrame((f) => ({ cur: (Math.min(f.cur, n - 1) + 1) % n, prev: Math.min(f.cur, n - 1) })), 1000 / Number(speed));
    return () => window.clearInterval(t);
  }, [playing, speed, n]);

  useEffect(() => {
    if (playing) sfx.frame();
    const c = strip.current;
    const el = c?.querySelector<HTMLElement>(`[data-f="${ci}"]`);
    if (c && el) c.scrollTo({ left: el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [ci]);

  const go = (i: number) => setFrame((f) => ({ cur: ((i % n) + n) % n, prev: Math.min(f.cur, n - 1) }));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat && e.code === "Space") return;
      if (pageShortcutBlocked(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const d = e.key === "ArrowRight" ? 1 : -1;
        setPlaying(false);
        setFrame((f) => {
          const c = Math.min(f.cur, n - 1);
          return { cur: (c + d + n) % n, prev: c };
        });
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n]);

  const cur = frames[ci];
  const mv = valueInYear(p, series?.rows, cur.year);
  const val = mv?.value ?? null;
  const chart = t.points.map((x) => ({ year: x.year, value: x.value }));
  const seriesIdx = chart.findIndex((s) => s.year === cur.year);
  const L = layerById(layer);
  const pctNow = t.first && val != null ? pctOf(t.first.value, val) : null;
  const markLoaded = (url: string) => setLoaded((l) => (l[url] ? l : { ...l, [url]: true }));

  return (
    <ViewScroll
      eyebrow="Decades in seconds"
      title="Timelapse"
      subtitle={`${p.name} · the clearest day near ${fmtDate(`2001-${p.month_day}`, "dayMonth")}, ${frames[0].year}–${frames[n - 1].year}`}
      actions={
        <>
          <PlacePicker />
          <SegmentedControl
            size="sm"
            value={layer}
            onChange={(v) => setLayer(v)}
            options={LAYERS.filter((l) => l.id !== "viirs").map((l) => ({ value: l.id, label: l.short }))}
          />
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <motion.div
            layoutId={stageId(p.id)}
            transition={morphTransition}
            style={{ borderRadius: 28 }}
            className="relative aspect-[16/10] w-full overflow-hidden rounded-[28px] bg-[#06080d] ring-1 ring-white/[0.08]"
          >
            {frames.map((f, i) => (
              <img
                key={f.url}
                src={f.url}
                alt={`${p.name} in ${f.year}`}
                draggable={false}
                // Current and neighbouring frames win the bandwidth race.
                fetchPriority={Math.abs(i - ci) <= 1 ? "high" : "low"}
                onLoad={() => markLoaded(f.url)}
                onError={() => markLoaded(f.url)}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  opacity: i === ci || i === pi ? 1 : 0,
                  zIndex: i === ci ? 2 : i === pi ? 1 : 0,
                  transition: i === ci ? "opacity 520ms cubic-bezier(.32,.72,0,1)" : "none",
                }}
              />
            ))}

            {!loaded[frames[ci].url] && !loaded[frames[pi].url] && (
              <div className="absolute inset-0 z-[3]">
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                <div className="absolute inset-0 grid place-items-center">
                  <Satellite className="animate-float text-white/20" size={34} />
                </div>
              </div>
            )}

            {playing && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-1/3 animate-scan bg-gradient-to-b from-transparent via-ios-teal/[0.09] to-transparent" />
            )}

            <div className="pointer-events-none absolute inset-0 z-[4] bg-gradient-to-t from-black/80 via-transparent to-black/30" />

            <span className="absolute left-4 top-4 z-[5] rounded-full px-3 py-1.5 text-[12px] font-semibold glass">
              {p.name} · {L.sensor}
            </span>

            <AnimatePresence>
              {progress < 1 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                  className="absolute right-4 top-4 z-[5] flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3.5 glass"
                >
                  <ProgressRing value={progress} />
                  <span className="text-[12px] font-semibold tabular-nums">
                    Loading {loadedCount}/{n}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pointer-events-none absolute inset-x-5 bottom-5 z-[5] flex items-end justify-between gap-4">
              <div>
                <motion.div
                  key={cur.year}
                  initial={{ opacity: 0.35, y: 12, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                  className="text-[64px] font-bold leading-none tracking-[-0.05em] tabular-nums sm:text-[84px]"
                >
                  {cur.year}
                </motion.div>
                <div className="mt-1 text-[13px] font-medium text-white/60">{fmtDate(cur.date, "medium")}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">{tg.label}</div>
                <div className="flex items-baseline justify-end gap-1.5">
                  {val != null ? <span className="text-[28px] font-bold tracking-tight tabular-nums sm:text-[34px]">{Math.round(val).toLocaleString("en-US")}</span> : <span className="text-[20px] font-semibold text-white/60">{series?.status === "loading" ? "measuring…" : "too cloudy"}</span>}
                  {val != null && <span className="text-[14px] font-medium text-white/55">km²</span>}
                </div>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-[6] h-[3px] bg-white/10">
              <motion.div className="h-full bg-white" animate={{ width: `${(ci / Math.max(1, n - 1)) * 100}%` }} transition={spring} />
            </div>
          </motion.div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[26px] p-2 glass liquid sm:gap-3">
            <IconButton
              icon={SkipBack}
              label="Previous year"
              variant="plain"
              tooltipSide="top"
              onClick={() => {
                setPlaying(false);
                go(ci - 1);
              }}
            />
            <motion.button
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => {
                if (playing) sfx.pause();
                else sfx.play();
                setPlaying((v) => !v);
              }}
              aria-label={playing ? "Pause" : "Play"}
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
            <IconButton
              icon={SkipForward}
              label="Next year"
              variant="plain"
              tooltipSide="top"
              onClick={() => {
                setPlaying(false);
                go(ci + 1);
              }}
            />
            <div className="flex min-w-[180px] flex-1 items-center gap-3 px-1">
              <span className="text-[12px] font-semibold tabular-nums text-white/45">{frames[0].year}</span>
              <input
                type="range"
                min={0}
                max={n - 1}
                value={ci}
                onChange={(e) => {
                  setPlaying(false);
                  go(Number(e.target.value));
                }}
                className="ios-range flex-1"
                style={{ ["--p" as string]: `${(ci / Math.max(1, n - 1)) * 100}%` }}
                aria-label="Timelapse position"
              />
              <span className="text-[12px] font-semibold tabular-nums text-white/45">{frames[n - 1].year}</span>
            </div>
            <SegmentedControl
              size="sm"
              value={speed}
              onChange={setSpeed}
              options={[
                { value: "0.5", label: "0.5×" },
                { value: "1", label: "1×" },
                { value: "2", label: "2×" },
              ]}
            />
          </div>

          <div ref={strip} className="no-scrollbar relative mt-4 flex gap-2.5 overflow-x-auto px-1 pb-1 pt-1">
            {frames.map((f, i) => (
              <button
                key={f.url}
                data-f={i}
                onClick={() => {
                  setPlaying(false);
                  go(i);
                }}
                className="relative shrink-0"
              >
                <div
                  className={cn(
                    "relative h-[58px] w-[92px] overflow-hidden rounded-[12px] bg-white/[0.05] transition-[opacity,transform] duration-300 ease-apple hover:-translate-y-0.5 hover:scale-[1.04]",
                    loaded[f.url] ? "opacity-100" : "opacity-40"
                  )}
                >
                  {loaded[f.url] ? (
                    <img src={f.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-white/[0.06]" />
                  )}
                </div>
                {i === ci && <motion.span layoutId="film-active" className="absolute -inset-[3px] bottom-[17px] rounded-[15px] ring-2 ring-white" transition={spring} />}
                <span className={cn("mt-1 block text-center text-[11px] font-semibold tabular-nums", i === ci ? "text-white" : "text-white/40")}>{f.year}</span>
              </button>
            ))}
          </div>
        </div>

        <Stagger className="flex flex-col gap-4">
          <Item className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-white/50">{tg.label} · {cur.year}</div>
                <div className="text-[28px] font-bold tracking-tight tabular-nums">{val != null ? fmtKm2(val) : "—"}</div>
              </div>
              <ChangePill value={pctNow} goodWhenUp={goodWhenUp(p)} />
            </div>
            {chart.length > 1 ? (
              <LineChart
                data={chart}
                color={p.color}
                height={210}
                activeIndex={seriesIdx >= 0 ? seriesIdx : undefined}
                unit="km²"
                onSelect={(i) => {
                  const fi = frames.findIndex((f) => f.year === chart[i].year);
                  if (fi >= 0) {
                    setPlaying(false);
                    go(fi);
                  }
                }}
                className="mt-3"
              />
            ) : (
              <div className="mt-3 grid h-[210px] place-items-center rounded-[16px] bg-white/[0.03] text-[13px] text-white/45">
                {series?.status === "error" ? "Couldn’t measure this place. Reopen to retry." : <span className="flex items-center gap-2"><Spinner /> Measuring the first years…</span>}
              </div>
            )}
            <p className="mt-2 text-[11.5px] leading-snug text-white/35">
              {series && series.missing > 0 ? `Measuring ${series.missing} more year${series.missing === 1 ? "" : "s"} from NASA imagery… ` : ""}
              Measured from MODIS bands 7-2-1. Cloudy years are left out. Tap the chart to jump to a year.
            </p>
          </Item>
          <Item className="card p-5">
            <h3 className="text-[15px] font-semibold">About this sequence</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/55">{p.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Frames", `${n}`],
                ["Cadence", "Yearly"],
                ["Sensor", L.sensor],
                ["Resolution", L.resolution],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[14px] bg-white/[0.04] px-3 py-2.5">
                  <div className="text-[11px] font-medium text-white/40">{k}</div>
                  <div className="truncate text-[13.5px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
          </Item>
        </Stagger>
      </div>
    </ViewScroll>
  );
}
