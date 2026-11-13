import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Blend,
  Bookmark,
  BookmarkCheck,
  Calendar,
  ChevronDown,
  ChevronRight,
  Columns2,
  Download,
  ExternalLink,
  Focus,
  Link,
  Satellite,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp, usePlace } from "@/store";
import { api, type CompareResult } from "@/lib/api";
import { changeMap, type ChangeMap } from "@/lib/analyze";
import { CLASSES, SURFACE_KEYS, fmtKm2, fmtPct, metricValue, narrate, targetOf } from "@/lib/spectral";
import { LAYERS, MONTHS, compareSnapshotSize, fmtDate, latestISO, layerById, monthOf, snapshotUrl, withYearMonth, worldviewUrl, yearOf, type LayerId } from "@/lib/gibs";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { CompareStage, stageId } from "@/components/CompareStage";
import { PlacePicker } from "@/components/PlacePicker";
import { Item, RollingNumber, Stagger } from "@/components/ui/motion";
import { Button, Popover, Pressable, SegmentedControl, Spinner, StatusBadge, spring } from "@/components/ui/primitives";

const TONES = { red: "#ff453a", orange: "#ff9f0a", blue: "#0a84ff", green: "#30d158" } as const;

function DatePill({ label, value, onChange, tone }: { label: string; value: string; onChange: (d: string) => void; tone: string }) {
  const [open, setOpen] = useState(false);
  const y = yearOf(value);
  const m = monthOf(value);
  const maxYear = yearOf(latestISO());
  const years = Array.from({ length: maxYear - 2000 + 1 }, (_, i) => 2000 + i);
  const pick = (yr: number, mo: number) => {
    let d = withYearMonth(value, yr, mo);
    if (d < "2000-02-24") d = "2000-02-24";
    if (d > latestISO()) d = latestISO();
    if (d !== value) onChange(d);
  };
  return (
    <div className="relative">
      <Pressable onClick={() => setOpen((o) => !o)} initial="rest" whileHover="hover" className="flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-3.5 glass liquid">
        <motion.span
          variants={{ rest: { scale: 1 }, hover: { scale: 1.04 } }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="grid h-8 w-8 place-items-center rounded-full"
          style={{ background: tone }}
        >
          <Calendar size={15} />
        </motion.span>
        <span className="text-left leading-tight">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{label}</span>
          <motion.span key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="block text-[13.5px] font-semibold tabular-nums">
            {fmtDate(value, "medium")}
          </motion.span>
        </span>
        <ChevronDown size={15} className={cn("text-white/45 transition-transform duration-300", open && "rotate-180")} />
      </Pressable>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[330px] p-3">
        <div className="mb-2 px-1 text-[12px] font-semibold text-white/45">Year</div>
        <div className="grid grid-cols-6 gap-1">
          {years.map((yr) => (
            <button
              key={yr}
              onClick={() => pick(yr, m)}
              className={cn("relative h-8 rounded-[9px] text-[12.5px] font-semibold tabular-nums transition-colors", yr === y ? "text-black" : "text-white/75 hover:bg-white/10")}
            >
              {yr === y && <motion.span layoutId={`yr-${label}`} className="absolute inset-0 rounded-[9px] bg-white" transition={spring} />}
              <span className="relative">{String(yr).slice(2) === "00" || yr % 5 === 0 ? yr : `’${String(yr).slice(2)}`}</span>
            </button>
          ))}
        </div>
        <div className="mb-2 mt-3 px-1 text-[12px] font-semibold text-white/45">Month</div>
        <div className="grid grid-cols-6 gap-1">
          {MONTHS.map((mo, i) => (
            <button
              key={mo}
              onClick={() => pick(y, i + 1)}
              className={cn("relative h-8 rounded-[9px] text-[12.5px] font-semibold transition-colors", i + 1 === m ? "text-white" : "text-white/70 hover:bg-white/10")}
            >
              {i + 1 === m && <motion.span layoutId={`mo-${label}`} className="absolute inset-0 rounded-[9px] bg-ios-blue" transition={spring} />}
              <span className="relative">{mo}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function ActionRow({ icon: Icon, color, label, onClick, href }: { icon: LucideIcon; color: string; label: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: color }}>
        <Icon size={16} color="#fff" strokeWidth={2.2} />
      </span>
      <span className="flex-1 text-left text-[14px] font-medium">{label}</span>
      <ChevronRight size={16} className="text-white/30 transition-transform group-hover:translate-x-0.5" />
    </>
  );
  const cls = "group flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 transition-colors hover:bg-white/[0.06] active:bg-white/[0.09]";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function Compare() {
  const placeId = useApp((s) => s.placeId);
  const hd = useApp((s) => s.settings.hdImagery);
  const notify = useApp((s) => s.notify);
  const watchlist = useApp((s) => s.watchlist);
  const toggleWatch = useApp((s) => s.toggleWatch);
  const { before, after, layer, mode } = useApp((s) => s.compare);
  const setCompare = useApp((s) => s.setCompare);
  const p = usePlace(placeId);
  const [spin, setSpin] = useState(0);

  // ---- The analyst: measure both dates on the server, draw the change map here ----
  const [result, setResult] = useState<{ key: string; data?: CompareResult; error?: string } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [map, setMap] = useState<{ key: string; data?: ChangeMap; error?: boolean } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const key = `${p.id}|${before}|${after}`;

  useEffect(() => {
    if (!p.id || before === after) return;
    let live = true;
    const t = window.setTimeout(() => {
      api
        .compare(p.id, before, after)
        .then((data) => live && setResult({ key, data }))
        .catch((e: Error) => live && setResult({ key, error: e.message }));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!showMap || before === after) return;
    let live = true;
    changeMap({ lat: p.lat, lon: p.lon, span: p.span }, before, after)
      .then((data) => live && setMap({ key, data }))
      .catch(() => live && setMap({ key, error: true }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, showMap]);

  const L = layerById(layer);
  const [w, h] = compareSnapshotSize(hd);
  const common = { layer, lat: p.lat, lon: p.lon, span: p.span, width: w, height: h };
  const bUrl = snapshotUrl({ ...common, date: before });
  const aUrl = snapshotUrl({ ...common, date: after });
  const wv = worldviewUrl(p.lat, p.lon, p.span, after, layer);
  const watching = watchlist.includes(p.id);
  const tg = targetOf(p.target);

  const ready = result?.key === key ? result : null;
  const data = ready?.data;
  const story = data ? narrate({ name: p.name, target: p.target, a: data.a, b: data.b, transitions: data.transitions }) : null;
  const va = data ? metricValue(data.a, p.target) ?? 0 : 0;
  const vb = data ? metricValue(data.b, p.target) ?? 0 : 0;
  const maxV = Math.max(va, vb, 1);
  const good = story?.delta == null ? true : story.delta >= 0 === tg.goodWhenUp;
  const overlay = showMap && map?.key === key ? map.data ?? null : null;
  const mapBusy = showMap && map?.key !== key;

  const changeDate = (which: "before" | "after", d: string) => setCompare({ [which]: d });

  const download = async () => {
    const name = `epoch-${p.id}-${after}.jpg`;
    try {
      const blob = await (await fetch(aUrl)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify({ title: "Image saved", subtitle: name, icon: "download", tone: "blue" });
    } catch {
      window.open(aUrl, "_blank", "noopener");
    }
  };

  const save = async () => {
    if (!data || !story) return;
    try {
      const f = await api.saveFinding({
        place_id: p.id,
        place_name: p.name,
        lat: p.lat,
        lon: p.lon,
        span: p.span,
        date_a: before,
        date_b: after,
        target: p.target,
        headline: story.headline,
        summary: story.lines.join(" "),
        result: { a: data.a, b: data.b, transitions: data.transitions },
      });
      useApp.getState().setFindings([f, ...useApp.getState().findings]);
      setSaved(key);
      notify({ title: "Finding saved", subtitle: "It’s on your Today page", icon: "bookmark", tone: "green" });
    } catch (e) {
      notify({ title: "Couldn’t save finding", subtitle: e instanceof Error ? e.message : undefined, icon: "alert", tone: "red", duration: 4000 });
    }
  };

  return (
    <ViewScroll
      eyebrow="Before & after, measured"
      title="Compare"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {p.name} · {p.region} <StatusBadge status={p.status} />
        </span>
      }
      actions={
        <SegmentedControl
          value={mode}
          onChange={(m) => setCompare({ mode: m })}
          options={[
            { value: "swipe", label: "Swipe", icon: ArrowLeftRight },
            { value: "split", label: "Split", icon: Columns2 },
            { value: "fade", label: "Fade", icon: Blend },
            { value: "lens", label: "Lens", icon: Focus },
          ]}
        />
      }
    >
      <div className="relative z-30 mb-4 flex flex-wrap items-center gap-2">
        <PlacePicker />
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
        <DatePill label="Before" value={before} onChange={(d) => changeDate("before", d)} tone="#636366" />
        <motion.button
          whileTap={{ scale: 0.86 }}
          onClick={() => {
            setCompare({ before: after, after: before });
            setSpin((s) => s + 1);
          }}
          aria-label="Swap dates"
          className="grid h-11 w-11 place-items-center rounded-full glass liquid"
        >
          <motion.span animate={{ rotate: spin * 180 }} transition={spring}>
            <ArrowLeftRight size={16} />
          </motion.span>
        </motion.button>
        <DatePill label="After" value={after} onChange={(d) => changeDate("after", d)} tone="#0a84ff" />
        <div className="ml-auto">
          <SegmentedControl size="sm" value={layer} onChange={(v) => setCompare({ layer: v })} options={LAYERS.filter((l) => l.id !== "viirs").map((l) => ({ value: l.id, label: l.short }))} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <CompareStage
            key={p.id}
            before={bUrl}
            after={aUrl}
            beforeLabel={fmtDate(before, "medium")}
            afterLabel={fmtDate(after, "medium")}
            mode={mode}
            autoSweep
            priority
            layoutId={stageId(p.id)}
            overlay={mode === "split" || mode === "lens" ? null : overlay?.url}
            className="aspect-[16/10] w-full ring-1 ring-white/[0.08]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-white/40">
            <span className="flex items-center gap-1.5">
              <Satellite size={13} /> {L.sensor} · {L.resolution} · {L.name}
            </span>
            <span>{data ? `Cloud ${Math.round(data.a.cloud_pct)}% → ${Math.round(data.b.cloud_pct)}% · ` : ""}Imagery: NASA GIBS</span>
          </div>
          {overlay && overlay.legend.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-white/70">
              {overlay.legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: l.color }} /> {l.label} · {fmtKm2(l.km2)}
                </span>
              ))}
            </div>
          )}
        </div>

        <Stagger className="flex flex-col gap-4">
          <Item className="card relative overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white/55">
                <Sparkles size={14} className="text-[#9fc9ff]" /> Analyst · {tg.label.toLowerCase()}
              </span>
              <span className="text-[12px] tabular-nums text-white/35">
                {yearOf(before)} → {yearOf(after)}
              </span>
            </div>
            {before === after ? (
              <p className="mt-4 text-[13.5px] text-white/55">Pick two different dates to measure what changed.</p>
            ) : !ready ? (
              <div className="flex items-center gap-2.5 py-8 text-[13.5px] text-white/55">
                <Spinner /> Downloading both scenes and counting pixels…
              </div>
            ) : ready.error || !data || !story ? (
              <div className="py-4">
                <p className="text-[13.5px] text-[#ff8a80]">{ready.error ?? "Measurement failed."}</p>
                <Button className="mt-3" size="sm" onClick={() => setResult(null)}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <RollingNumber
                  key={good ? "g" : "b"}
                  value={story.delta == null ? 0 : Math.round(story.delta)}
                  signed
                  suffix="%"
                  className={cn("mt-1 text-[50px] font-bold tracking-[-0.045em]", story.delta == null ? "text-white/40" : good ? "text-ios-green" : "text-[#ff6961]")}
                />
                <p className="text-[14px] font-semibold tracking-tight">{story.headline}</p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: fmtDate(before, "medium"), v: va, c: "#8e8e93" },
                    { label: fmtDate(after, "medium"), v: vb, c: tg.color },
                  ].map((r, i) => (
                    <div key={i}>
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span className="font-semibold tabular-nums text-white/55">{r.label}</span>
                        <span className="tabular-nums text-white/85">{fmtKm2(r.v)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
                        <motion.div className="h-full rounded-full" style={{ background: r.c }} initial={{ width: 0 }} animate={{ width: `${(r.v / maxV) * 100}%` }} transition={{ type: "spring", stiffness: 110, damping: 20, delay: 0.1 + i * 0.1 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-white/65">
                  {story.lines.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant={showMap ? "primary" : "glass"} icon={ScanLine} onClick={() => setShowMap((v) => !v)}>
                    {mapBusy ? "Mapping…" : showMap ? "Hide change map" : "Show change map"}
                  </Button>
                  <Button size="sm" icon={saved === key ? BookmarkCheck : Bookmark} disabled={saved === key} onClick={() => void save()}>
                    {saved === key ? "Saved" : "Save finding"}
                  </Button>
                  <Button size="sm" icon={Sparkles} onClick={() => useApp.getState().setAnalyst(true, `Show the trend for ${p.name}`)}>
                    Ask about the trend
                  </Button>
                </div>
                {showMap && map?.key === key && map.error && <p className="mt-2 text-[12px] text-[#ff8a80]">The change map couldn’t be drawn in this browser.</p>}
              </>
            )}
          </Item>

          {data && (
            <Item className="card p-5">
              <h3 className="mb-3 text-[15px] font-semibold">Land cover, pixel by pixel</h3>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 text-[12.5px]">
                <span />
                <span className="text-right text-[11px] font-semibold text-white/40">{yearOf(before)}</span>
                <span className="text-right text-[11px] font-semibold text-white/40">{yearOf(after)}</span>
                {SURFACE_KEYS.map((k) => {
                  const c = CLASSES.find((x) => x.key === k)!;
                  const x = (data.a as unknown as Record<string, number>)[`${k}_km2`] ?? 0;
                  const y = (data.b as unknown as Record<string, number>)[`${k}_km2`] ?? 0;
                  if (x < 1 && y < 1) return null;
                  return (
                    <div key={k} className="contents">
                      <span className="flex items-center gap-2 text-white/75">
                        <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${c.color.join(",")})` }} /> {c.label}
                      </span>
                      <span className="text-right tabular-nums text-white/60">{fmtKm2(x)}</span>
                      <span className="text-right font-semibold tabular-nums">{fmtKm2(y)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-white/35">
                Estimated from 250–500 m MODIS bands 7-2-1 browse imagery. Good for direction and scale; not a calibrated science product. {fmtPct(story?.delta ?? null) === "—" ? "" : ""}
              </p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-white/45">{p.summary}</p>
            </Item>
          )}

          <Item className="card p-2">
            <ActionRow icon={Download} color="#0a84ff" label="Download after image" onClick={() => void download()} />
            <ActionRow
              icon={Link}
              color="#5e5ce6"
              label="Copy link to this place"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/#/compare/${p.id}`);
                  notify({ title: "Link copied", subtitle: "Opens this place in Compare", icon: "link", tone: "purple" });
                } catch {
                  notify({ title: "Couldn’t copy", subtitle: "Clipboard access was blocked", icon: "alert", tone: "orange" });
                }
              }}
            />
            <ActionRow icon={ExternalLink} color="#30d158" label="Open in NASA Worldview" href={wv} />
            <ActionRow
              icon={watching ? BookmarkCheck : Bookmark}
              color="#ff9f0a"
              label={watching ? "Watching this place" : "Add to watchlist"}
              onClick={() => {
                toggleWatch(p.id);
                notify({ title: watching ? "Removed from Watchlist" : "Added to Watchlist", subtitle: p.name, icon: "bookmark", tone: watching ? "orange" : "green" });
              }}
            />
          </Item>
        </Stagger>
      </div>
    </ViewScroll>
  );
}
