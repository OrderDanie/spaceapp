import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Columns2, Film, Flame, Plus, Sparkles, Trash2 } from "lucide-react";
import { warmCompare, warmCompareWhenIdle } from "@/lib/warm";
import { useApp, usePlace, useSeries, useUnreadCount } from "@/store";
import type { Place } from "@/data/places";
import { fmtDate, snapshotUrl, todayISO } from "@/lib/gibs";
import { goodWhenUp, trendOf } from "@/lib/metrics";
import { fmtDay, fmtKm2, targetOf } from "@/lib/spectral";
import { api } from "@/lib/api";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { CompareStage, morphTransition, stageId } from "@/components/CompareStage";
import { SatImage } from "@/components/ui/SatImage";
import { Item, Reveal, RollingNumber, Stagger } from "@/components/ui/motion";
import { Sparkline } from "@/components/ui/charts";
import { Button, CategoryIcon, ChangePill, IconButton, SectionHeader, Spinner, StatusBadge, spring } from "@/components/ui/primitives";

function greeting() {
  const h = new Date().getHours();
  if (h < 5 || h >= 18) return "Good evening";
  return h < 12 ? "Good morning" : "Good afternoon";
}

function FeaturedCard({ id }: { id: string }) {
  const p = usePlace(id);
  const series = useSeries(id);
  const selectPlace = useApp((s) => s.selectPlace);
  const hd = useApp((s) => s.settings.hdImagery);
  const t = trendOf(p, series?.rows);
  const tg = targetOf(p.target);
  // Picture and number describe the same span: first and latest clear year on record.
  const a = t.first?.date ?? p.before;
  const b = t.last?.date ?? p.after;
  const [w, h] = hd ? [1440, 810] : [1024, 576];
  const common = { layer: p.layer, lat: p.lat, lon: p.lon, span: p.span, width: w, height: h };
  useEffect(() => warmCompareWhenIdle(p, hd), [p, hd]);
  return (
    <div className="card relative h-[460px] overflow-hidden sm:h-[500px]">
      <CompareStage
        before={snapshotUrl({ ...common, date: a })}
        after={snapshotUrl({ ...common, date: b })}
        beforeLabel={a.slice(0, 4)}
        afterLabel={b.slice(0, 4)}
        loop
        labels={false}
        priority
        className="absolute inset-0"
        rounded="rounded-[26px]"
        layoutId={stageId(p.id)}
        radius={26}
      />
      <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-t from-black/90 via-black/25 to-black/20" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 sm:left-5 sm:top-5">
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black">
          <Sparkles size={13} /> Biggest measured change
        </span>
        <span className="hidden rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums glass sm:inline">
          {fmtDate(a, "monthYear")} – {fmtDate(b, "monthYear")}
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-col gap-3 sm:inset-x-6 sm:bottom-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 max-w-xl sm:flex-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/70">
            <CategoryIcon category={p.category} size={22} /> {p.region}
          </div>
          <h2 className="mt-2 text-[30px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[42px]">{p.name}</h2>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/65">{p.headline}. Drag the divider to travel between the two dates.</p>
          <div className="pointer-events-auto mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={Columns2} onClick={() => useApp.getState().openCompare(p.id, a, b)}>
              Compare
            </Button>
            <Button icon={Film} onClick={() => selectPlace(p.id, "timelapse")}>
              Timelapse
            </Button>
          </div>
        </div>
        {t.total != null && t.first && t.last && (
          <div className="shrink-0 sm:text-right">
            <RollingNumber value={Math.round(t.total)} signed suffix="%" className="text-[52px] font-bold tracking-[-0.045em] sm:text-[72px]" />
            <div className="text-[13px] font-medium text-white/60">
              {tg.short}, {t.first.year}–{t.last.year} · {t.smoothed ? "3-year medians" : "measured"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EarthNowCard() {
  const events = useApp((s) => s.events);
  const status = useApp((s) => s.eventsStatus);
  const setView = useApp((s) => s.setView);
  const setPin = useApp((s) => s.setPin);
  const setExploreDate = useApp((s) => s.setExploreDate);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.categoryLabel, (counts.get(e.categoryLabel) ?? 0) + 1);
  return (
    <div className="card flex h-full min-h-[320px] flex-col p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold text-white/45">Earth right now · NASA EONET</div>
          <div className="text-[19px] font-bold tracking-tight">{status === "ready" ? `${events.length} open natural events` : status === "error" ? "Events unavailable" : "Checking live events…"}</div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-ios-green/15 px-2.5 py-1 text-[11.5px] font-semibold text-ios-green">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-ios-green" /> Live
        </span>
      </div>
      {status === "loading" && <div className="grid flex-1 place-items-center"><Spinner size={20} /></div>}
      {status === "error" && <p className="mt-4 text-[13px] text-white/50">NASA’s event tracker isn’t responding. Imagery and measurements are unaffected.</p>}
      {status === "ready" && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => (
              <span key={label} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] font-medium text-white/75">
                {n} {label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex-1 space-y-0.5">
            {events.slice(0, 8).map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setView("explore");
                  setExploreDate(e.date);
                  setPin({ lat: e.lat, lon: e.lon, name: e.title, span: 3, event: e });
                }}
                className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span className="h-2 w-2 shrink-0 rotate-45 rounded-[2px]" style={{ background: e.category === "wildfires" ? "#ff9f0a" : e.category === "severeStorms" ? "#5e5ce6" : e.category === "seaLakeIce" ? "#64d2ff" : "#ff453a" }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{e.title}</span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-white/40">{fmtDate(e.date, "short")}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setView("alerts")} className="mt-2 self-start text-[13px] font-semibold text-[#4aa3ff]">
            See all in Alerts
          </button>
        </>
      )}
    </div>
  );
}

function ChangeCard({ p, featured }: { p: Place; featured: boolean }) {
  const series = useSeries(p.id);
  const selectPlace = useApp((s) => s.selectPlace);
  const hd = useApp((s) => s.settings.hdImagery);
  const t = trendOf(p, series?.rows);
  return (
    <motion.button
      layoutId={featured ? undefined : stageId(p.id)}
      onPointerEnter={() => warmCompare(p, hd)}
      onClick={() => selectPlace(p.id, "compare")}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
      transition={{ ...spring, ...morphTransition }}
      style={{ borderRadius: 24 }}
      className="group relative h-[236px] w-[292px] shrink-0 snap-start overflow-hidden rounded-[24px] text-left ring-1 ring-white/[0.08]"
    >
      <SatImage lazy src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 600, height: 480 })} className="absolute inset-0" imgClassName="transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/10" />
      <div className="absolute left-3 top-3">
        <StatusBadge status={p.status} className="backdrop-blur-md" />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold tracking-tight">{p.name}</div>
          <div className="truncate text-[12px] text-white/55">
            {targetOf(p.target).label}
            {t.first && t.last ? ` · ${t.first.year}–${t.last.year}` : series?.status === "loading" ? " · measuring…" : ""}
          </div>
        </div>
        <ChangePill value={t.total} goodWhenUp={goodWhenUp(p)} />
      </div>
    </motion.button>
  );
}

function WatchRow({ id }: { id: string }) {
  const p = usePlace(id);
  const series = useSeries(id);
  const selectPlace = useApp((s) => s.selectPlace);
  const t = trendOf(p, series?.rows);
  return (
    <button onClick={() => selectPlace(id, "explore")} className="flex w-full items-center gap-3 rounded-[18px] p-2.5 text-left transition-colors hover:bg-white/[0.06]">
      <SatImage lazy showIcon={false} src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 160, height: 160 })} className="h-12 w-12 shrink-0 rounded-[14px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{p.name}</div>
        <div className="truncate text-[12px] text-white/45">{p.region}</div>
      </div>
      {t.points.length > 1 && <Sparkline values={t.points.map((x) => x.value)} color={p.color} width={90} height={30} className="hidden sm:block" />}
      <div className="w-[108px] text-right">
        <div className="text-[13.5px] font-semibold tabular-nums">{t.last ? fmtKm2(t.last.value) : series?.status === "loading" ? "Measuring…" : "—"}</div>
        <ChangePill value={t.total} goodWhenUp={goodWhenUp(p)} className="mt-0.5" />
      </div>
    </button>
  );
}

export function Today() {
  const places = useApp((s) => s.places);
  const series = useApp((s) => s.series);
  const watchlist = useApp((s) => s.watchlist);
  const alerts = useApp((s) => s.alerts);
  const findings = useApp((s) => s.findings);
  const setFindings = useApp((s) => s.setFindings);
  const events = useApp((s) => s.events.length);
  const setAnalyst = useApp((s) => s.setAnalyst);
  const setAddPlace = useApp((s) => s.setAddPlace);
  const setView = useApp((s) => s.setView);
  const openCompare = useApp((s) => s.openCompare);
  const unread = useUnreadCount();
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  // The hero is whichever place has the largest measured change on record.
  const ranked = places.map((p) => ({ p, total: trendOf(p, series[p.id]?.rows).total })).sort((a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0));
  const featured = ranked[0]?.p ?? places[0];
  const measured = Object.values(series).reduce((n, s) => n + s.rows.length, 0);

  const stats = [
    { label: "Places tracked", value: places.length },
    { label: "Yearly scenes measured", value: measured },
    { label: "Alerts on record", value: alerts.length },
    { label: "Open natural events", value: events },
  ];

  return (
    <ViewScroll
      eyebrow={fmtDate(todayISO(), "long")}
      title={greeting()}
      subtitle={`${places.length} places tracked · ${unread ? `${unread} unread measured change${unread === 1 ? "" : "s"}` : "no unread alerts"}`}
      actions={
        <Button icon={Sparkles} variant="tinted" onClick={() => setAnalyst(true, "Give me a briefing")}>
          Brief me
        </Button>
      }
    >
      <Stagger className="grid grid-cols-12 gap-4 lg:gap-5">
        <Item className="col-span-12 xl:col-span-8">{featured && <FeaturedCard id={featured.id} />}</Item>
        <Item className="col-span-12 xl:col-span-4">
          <EarthNowCard />
        </Item>

        <Item className="col-span-12">
          <div className="card grid grid-cols-2 gap-y-1 py-2 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]">
            {stats.map((s) => (
              <div key={s.label} className="px-5 py-3">
                <RollingNumber value={s.value} className="text-[26px] font-semibold tracking-[-0.03em]" />
                <div className="text-[12.5px] text-white/50">{s.label}</div>
              </div>
            ))}
          </div>
        </Item>

        <Reveal className="col-span-12 mt-2">
          <SectionHeader
            title="All places"
            action={
              <div className="flex gap-1.5">
                <IconButton icon={ChevronLeft} label="Previous" size="sm" onClick={() => scroll(-1)} />
                <IconButton icon={ChevronRight} label="Next" size="sm" onClick={() => scroll(1)} />
              </div>
            }
          />
          <div ref={scroller} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 pt-1 sm:-mx-8 sm:px-8">
            {ranked.map(({ p }) => (
              <ChangeCard key={p.id} p={p} featured={p.id === featured?.id} />
            ))}
          </div>
        </Reveal>

        <Reveal className="col-span-12 xl:col-span-7">
          <div className="card h-full p-2">
            <div className="flex items-center justify-between px-3 pb-1 pt-3">
              <h3 className="text-[17px] font-bold tracking-tight">Watchlist</h3>
              <button onClick={() => setAddPlace({})} className="flex items-center gap-1 text-[13px] font-semibold text-[#4aa3ff]">
                <Plus size={14} /> Track a place
              </button>
            </div>
            {watchlist.length === 0 && <p className="px-3 py-6 text-[13.5px] text-white/45">Nothing on your watchlist yet. Add a place to follow its measured trend.</p>}
            {watchlist.map((id) => (
              <WatchRow key={id} id={id} />
            ))}
          </div>
        </Reveal>

        <Reveal className="col-span-12 xl:col-span-5" delay={0.06}>
          <div className="card h-full p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[17px] font-bold tracking-tight">Latest measured changes</h3>
              <button onClick={() => setView("alerts")} className="text-[13px] font-semibold text-[#4aa3ff]">
                All alerts
              </button>
            </div>
            {alerts.length === 0 && <p className="text-[13.5px] text-white/45">No alerts yet. They appear when a place’s measured trend moves by more than a few percent.</p>}
            <div className="space-y-2">
              {alerts.slice(0, 4).map((a) => (
                <button key={a.id} onClick={() => setView("alerts")} className="block w-full rounded-[14px] bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{places.find((p) => p.id === a.place_id)?.name}</div>
                  <div className="text-[13.5px] font-semibold">{a.title}</div>
                  <div className="truncate text-[12px] text-white/50">{a.body}</div>
                </button>
              ))}
            </div>
            {findings.length > 0 && (
              <>
                <h4 className="mb-2 mt-5 text-[13px] font-semibold text-white/50">Your saved findings</h4>
                <div className="space-y-2">
                  {findings.slice(0, 4).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2.5">
                      <button className="min-w-0 flex-1 text-left" onClick={() => f.place_id && openCompare(f.place_id, f.date_a, f.date_b)}>
                        <div className="truncate text-[13.5px] font-semibold">{f.place_name} · {f.headline}</div>
                        <div className="text-[12px] text-white/45">{fmtDay(f.date_a)} → {fmtDay(f.date_b)}</div>
                      </button>
                      <IconButton
                        icon={Trash2}
                        label="Delete finding"
                        variant="plain"
                        size="sm"
                        onClick={() => void api.removeFinding(f.id).then(() => setFindings(useApp.getState().findings.filter((x) => x.id !== f.id))).catch(() => useApp.getState().notify({ title: "Couldn’t delete", icon: "alert", tone: "red" }))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Reveal>
      </Stagger>
    </ViewScroll>
  );
}
