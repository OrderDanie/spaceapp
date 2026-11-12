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
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { placeById, valueAt } from "@/data/places";
import { LAYERS, MONTHS, compareSnapshotSize, fmtDate, latestISO, layerById, monthOf, snapshotUrl, withYearMonth, worldviewUrl, yearOf, type LayerId } from "@/lib/gibs";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { CompareStage, stageId, type CompareMode } from "@/components/CompareStage";
import { PlacePicker } from "@/components/PlacePicker";
import { Item, RollingNumber, Stagger } from "@/components/ui/motion";
import { Popover, Pressable, SegmentedControl, StatusBadge, goodWhenUp, spring } from "@/components/ui/primitives";

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
          variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: [0, -12, 10, 0], scale: 1.08 } }}
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
  const p = placeById(placeId);

  const [before, setBefore] = useState(p.before);
  const [after, setAfter] = useState(p.after);
  const [layer, setLayer] = useState<LayerId>(p.layer);
  const [mode, setMode] = useState<CompareMode>("swipe");
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    setBefore(p.before);
    setAfter(p.after);
    setLayer(p.layer);
  }, [p]);

  const L = layerById(layer);
  const [w, h] = compareSnapshotSize(hd);
  const common = { layer, lat: p.lat, lon: p.lon, span: p.span, width: w, height: h };
  const bUrl = snapshotUrl({ ...common, date: before });
  const aUrl = snapshotUrl({ ...common, date: after });
  const by = yearOf(before);
  const ay = yearOf(after);
  const bv = valueAt(p, by);
  const av = valueAt(p, ay);
  const pct = ((av - bv) / bv) * 100;
  const maxV = Math.max(bv, av) || 1;
  const good = pct >= 0 === goodWhenUp(p.category);
  const wv = worldviewUrl(p.lat, p.lon, p.span, after, layer);
  const watching = watchlist.includes(p.id);
  const fmtV = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: p.metric.decimals });

  const changeDate = (which: "before" | "after", d: string) => {
    (which === "before" ? setBefore : setAfter)(d);
    notify({ title: "Fetching imagery", subtitle: `${L.sensor} · ${fmtDate(d, "medium")}`, icon: "satellite", tone: "teal", progress: true, duration: 1700 });
  };

  return (
    <ViewScroll
      eyebrow="Before & after"
      title="Compare"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {p.name} · {p.region} <StatusBadge status={p.status} />
        </span>
      }
      actions={
        <SegmentedControl
          value={mode}
          onChange={setMode}
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
            setBefore(after);
            setAfter(before);
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
          <SegmentedControl
            size="sm"
            value={layer}
            onChange={(v) => setLayer(v)}
            options={LAYERS.filter((l) => l.id !== "viirs").map((l) => ({ value: l.id, label: l.short }))}
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
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
            className="aspect-[16/10] w-full ring-1 ring-white/[0.08]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-white/40">
            <span className="flex items-center gap-1.5">
              <Satellite size={13} /> {L.sensor} · {L.resolution} · {L.name}
            </span>
            <span>Cloud cover ≈ {p.cloud}% · Imagery: NASA GIBS</span>
          </div>
        </div>

        <Stagger className="flex flex-col gap-4">
          <Item className="card relative overflow-hidden p-5">
            {/* Soft tinted pulse each time the result recomputes */}
            <motion.span
              key={`${p.id}-${by}-${ay}-${layer}`}
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
              style={{ background: good ? "#30d158" : "#ff453a" }}
              initial={{ scale: 0, opacity: 0.35 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 1.3, ease: [0.32, 0.72, 0, 1] }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white/50">{p.metric.label}</span>
              <span className="text-[12px] tabular-nums text-white/35">
                {by} → {ay}
              </span>
            </div>
            <motion.div
              key={good ? "good" : "bad"}
              initial={{ scale: 0.92, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="origin-left"
            >
              <RollingNumber
                value={Math.round(pct)}
                signed
                suffix="%"
                className={cn("mt-1 text-[50px] font-bold tracking-[-0.045em] transition-colors duration-500", good ? "text-ios-green" : "text-[#ff6961]")}
              />
            </motion.div>
            <p className="text-[13px] text-white/50">
              {good ? "Improving" : "Declining"} across {Math.max(1, Math.abs(ay - by))} {Math.abs(ay - by) === 1 ? "year" : "years"}
            </p>
            <div className="mt-4 space-y-3">
              {[
                { label: String(by), v: bv, c: "#8e8e93" },
                { label: String(ay), v: av, c: good ? "#30d158" : "#ff453a" },
              ].map((r, i) => (
                <div key={i}>
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span className="font-semibold tabular-nums text-white/55">{r.label}</span>
                    <span className="tabular-nums text-white/85">
                      {fmtV(r.v)} {p.metric.unit}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: r.c }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.v / maxV) * 100}%` }}
                      transition={{ type: "spring", stiffness: 110, damping: 20, delay: 0.2 + i * 0.1 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Item>

          <Item className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <motion.span
                key={p.id}
                animate={{ y: [-6, 6, -6] }}
                transition={{ duration: 2.4, repeat: 2, ease: "easeInOut" }}
                className="grid place-items-center"
              >
                <ScanLine size={16} className="text-ios-teal" />
              </motion.span>
              Detected signals
            </h3>
            <div className="space-y-2">
              {p.signals.map((s, i) => (
                <motion.div
                  key={`${p.id}-${s.label}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.25 + i * 0.07 }}
                  className="flex items-center justify-between rounded-[14px] bg-white/[0.04] px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[13px] text-white/75">
                    <span className="h-2 w-2 rounded-full" style={{ background: TONES[s.tone], boxShadow: `0 0 8px ${TONES[s.tone]}` }} />
                    {s.label}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums">{s.value}</span>
                </motion.div>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/45">{p.summary}</p>
          </Item>

          <Item className="card p-2">
            <ActionRow
              icon={Download}
              color="#0a84ff"
              label="Download after image"
              onClick={() => {
                window.open(aUrl, "_blank", "noopener");
                notify({ title: "Image opened", subtitle: `${p.name} · ${fmtDate(after, "medium")}`, icon: "download", tone: "blue" });
              }}
            />
            <ActionRow
              icon={Link}
              color="#5e5ce6"
              label="Copy share link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(wv);
                } catch {
                  /* clipboard may be blocked */
                }
                notify({ title: "Link copied", subtitle: "Opens this view in NASA Worldview", icon: "link", tone: "purple" });
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
