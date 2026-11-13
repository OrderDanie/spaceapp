import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Archive, BellOff, Check, CircleAlert, CircleCheck, CloudOff, ExternalLink, Flame, Info, Mountain, RotateCcw, Snowflake, Tornado, TriangleAlert, Waves } from "lucide-react";
import { cn } from "@/utils/cn";
import { sfx } from "@/lib/sound";
import { placeById, useApp } from "@/store";
import type { AlertRow, EarthEvent, Severity } from "@/data/places";
import { fmtDate, snapshotUrl } from "@/lib/gibs";
import { trendOf } from "@/lib/metrics";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { SatImage } from "@/components/ui/SatImage";
import { Button, Notice, SegmentedControl, Spinner, spring } from "@/components/ui/primitives";

const SEV: Record<Severity, { color: string; icon: LucideIcon }> = {
  critical: { color: "#ff453a", icon: TriangleAlert },
  warning: { color: "#ff9f0a", icon: CircleAlert },
  info: { color: "#0a84ff", icon: Info },
  good: { color: "#30d158", icon: CircleCheck },
};
const EVENT_ICON: Record<string, { icon: LucideIcon; color: string }> = {
  wildfires: { icon: Flame, color: "#ff9f0a" },
  severeStorms: { icon: Tornado, color: "#5e5ce6" },
  volcanoes: { icon: Mountain, color: "#ff453a" },
  seaLakeIce: { icon: Snowflake, color: "#64d2ff" },
  floods: { icon: Waves, color: "#0a84ff" },
};

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days < 1 && d.getDate() === new Date().getDate()) return { group: "Today", label: time };
  if (days < 2) return { group: "Yesterday", label: "Yesterday" };
  return { group: "Earlier", label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
}

/** Open Compare on the two measurements an alert is about. */
function openAlert(a: AlertRow) {
  const s = useApp.getState();
  const p = placeById(a.place_id);
  const t = trendOf(p, s.series[p.id]?.rows);
  s.markRead(a.id);
  const from = a.kind === "yoy" ? t.prev : t.first;
  if (from && t.last) s.openCompare(p.id, from.date, t.last.date);
  else s.selectPlace(p.id, "compare");
}

function SwipeAlert({ a }: { a: AlertRow }) {
  const read = useApp((s) => s.readAlerts.includes(a.id));
  const markRead = useApp((s) => s.markRead);
  const dismiss = useApp((s) => s.dismiss);
  const notify = useApp((s) => s.notify);
  const p = placeById(a.place_id);
  const s = SEV[a.severity] ?? SEV.info;
  const Icon = s.icon;
  const x = useMotionValue(0);
  const actionsOpacity = useTransform(x, [-150, -30, 0], [1, 0.35, 0]);
  const doDismiss = () => {
    sfx.swipe();
    dismiss(a.id);
    notify({ title: "Alert dismissed", subtitle: p.name, icon: "check", tone: "blue", duration: 4800, actionLabel: "Undo", action: () => useApp.getState().restoreAlert(a.id) });
  };
  return (
    <div className="relative">
      <motion.div style={{ opacity: actionsOpacity }} className="absolute inset-y-0 right-0 flex items-center gap-2 pr-1">
        <button onClick={() => { markRead(a.id); animate(x, 0, spring); }} className="flex h-[calc(100%-12px)] w-[70px] flex-col items-center justify-center gap-1 rounded-[20px] bg-ios-blue text-[12px] font-semibold">
          <Check size={18} /> Read
        </button>
        <button onClick={doDismiss} className="flex h-[calc(100%-12px)] w-[70px] flex-col items-center justify-center gap-1 rounded-[20px] bg-ios-red text-[12px] font-semibold">
          <Archive size={18} /> Dismiss
        </button>
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -160, right: 0 }}
        dragElastic={{ left: 0.25, right: 0.02 }}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -230 || info.velocity.x < -1100) return doDismiss();
          animate(x, info.offset.x < -70 ? -160 : 0, spring);
        }}
        onTap={() => {
          if (Math.abs(x.get()) > 4) return void animate(x, 0, spring);
          openAlert(a);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && openAlert(a)}
        whileTap={{ scale: 0.985 }}
        className="relative cursor-pointer touch-pan-y"
      >
        <div className="card flex items-start gap-3.5 bg-[#151517] p-4" style={{ borderRadius: 24 }}>
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[13px]" style={{ background: `linear-gradient(180deg, ${s.color}, color-mix(in srgb, ${s.color} 58%, #000))` }}>
            <Icon size={21} color="#fff" strokeWidth={2.3} />
            {!read && <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-ios-blue ring-2 ring-[#151517]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11.5px] font-semibold uppercase tracking-wider text-white/45">{p.name}</span>
              <span className="shrink-0 text-[12px] text-white/40">{when(a.created_at).label}</span>
            </div>
            <div className={cn("mt-0.5 text-[15px] tracking-tight", !read ? "font-semibold text-white" : "font-medium text-white/75")}>{a.title}</div>
            <p className="mt-0.5 text-[13px] leading-snug text-white/55">{a.body}</p>
          </div>
          <SatImage lazy showIcon={false} src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 200, height: 200 })} className="hidden h-16 w-16 shrink-0 rounded-[14px] sm:block" />
        </div>
      </motion.div>
    </div>
  );
}

function EventRow({ e }: { e: EarthEvent }) {
  const meta = EVENT_ICON[e.category] ?? { icon: Info, color: "#8e8e93" };
  const Icon = meta.icon;
  const show = () => {
    const s = useApp.getState();
    s.setView("explore");
    s.setExploreDate(e.date);
    s.setPin({ lat: e.lat, lon: e.lon, name: e.title, span: 3, event: e });
  };
  return (
    <div className="card flex items-center gap-3.5 bg-[#151517] p-3.5" style={{ borderRadius: 22 }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ background: `linear-gradient(180deg, ${meta.color}, color-mix(in srgb, ${meta.color} 58%, #000))` }}>
        <Icon size={19} color="#fff" strokeWidth={2.3} />
      </span>
      <button onClick={show} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[14.5px] font-semibold tracking-tight">{e.title}</div>
        <div className="truncate text-[12.5px] text-white/50">
          {e.categoryLabel} · updated {fmtDate(e.date, "medium")}
          {e.magnitude ? ` · ${e.magnitude.toLocaleString("en-US")} ${e.unit}` : ""}
        </div>
      </button>
      {e.link && (
        <a href={e.link} target="_blank" rel="noreferrer" aria-label="Open source report" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white">
          <ExternalLink size={15} />
        </a>
      )}
      <Button size="sm" onClick={show}>
        On globe
      </Button>
    </div>
  );
}

export function Alerts() {
  const alerts = useApp((s) => s.alerts);
  const alertsStatus = useApp((s) => s.alertsStatus);
  const events = useApp((s) => s.events);
  const eventsStatus = useApp((s) => s.eventsStatus);
  const read = useApp((s) => s.readAlerts);
  const dismissed = useApp((s) => s.dismissed);
  const markAllRead = useApp((s) => s.markAllRead);
  const restore = useApp((s) => s.restoreAlerts);
  const notify = useApp((s) => s.notify);
  const [tab, setTab] = useState<"measured" | "live">("measured");
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");
  const [cat, setCat] = useState("all");

  const live = alerts.filter((a) => !dismissed.includes(a.id));
  const visible = live.filter((a) => (filter === "all" ? true : filter === "unread" ? !read.includes(a.id) : a.severity === "critical"));
  const unread = live.filter((a) => !read.includes(a.id)).length;
  const groups = (["Today", "Yesterday", "Earlier"] as const).map((g) => ({ g, items: visible.filter((a) => when(a.created_at).group === g) })).filter((x) => x.items.length);
  const cats = [...new Map(events.map((e) => [e.category, e.categoryLabel])).entries()];
  const shownEvents = events.filter((e) => cat === "all" || e.category === cat);

  return (
    <ViewScroll
      eyebrow="Measured changes & live events"
      title="Alerts"
      subtitle={tab === "measured" ? (unread ? `${unread} unread · swipe left on a card to triage` : "You’re all caught up") : `${events.length} open events from NASA EONET, last 30 days`}
      actions={
        <>
          <SegmentedControl value={tab} onChange={setTab} options={[{ value: "measured", label: "Measured" }, { value: "live", label: "Live events" }]} />
          {tab === "measured" && (
            <Button icon={Check} disabled={!unread} onClick={() => { markAllRead(); notify({ title: "All caught up", subtitle: "Every alert marked as read", icon: "check", tone: "green" }); }}>
              Mark all read
            </Button>
          )}
        </>
      }
    >
      <div className="max-w-[820px]">
        {/* The two lists slide past each other like pages of a segmented view. */}
        <AnimatePresence mode="wait" initial={false}>
        {tab === "measured" ? (
          <motion.div key="measured" initial={{ opacity: 0, x: -36, filter: "blur(8px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }} exit={{ opacity: 0, x: -28, filter: "blur(6px)", transition: { duration: 0.16 } }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            <div className="mb-5">
              <SegmentedControl size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }, { value: "critical", label: "Critical" }]} />
            </div>
            {alertsStatus === "loading" && <div className="grid place-items-center py-20"><Spinner size={22} /></div>}
            {alertsStatus === "error" && <Notice icon={CloudOff} tone="#ff9f0a" title="Couldn’t load alerts" body="The database didn’t answer." action={<Button icon={RotateCcw} onClick={() => void useApp.getState().loadAlerts()}>Try again</Button>} />}
            {alertsStatus === "ready" && groups.length === 0 && (
              <Notice
                icon={live.length ? Check : BellOff}
                tone="#30d158"
                title={alerts.length === 0 ? "No alerts yet" : filter !== "all" && live.length ? "Nothing matches this filter" : "You’re all caught up"}
                body={alerts.length === 0 ? "Alerts are written when a place’s measured trend moves by more than a few percent." : "Every alert here comes from measurements of NASA imagery."}
                action={dismissed.length ? <Button icon={RotateCcw} onClick={restore}>Restore dismissed alerts</Button> : undefined}
              />
            )}
            <AnimatePresence mode="popLayout" initial={false}>
              {groups.map(({ g, items }) => (
                <motion.section key={g} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="mb-8">
                  <h2 className="mb-3 px-1 text-[20px] font-bold tracking-tight">{g}</h2>
                  <div className="flex flex-col gap-2.5">
                    <AnimatePresence initial={false}>
                      {items.map((a) => (
                        <motion.div key={a.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -120, height: 0, transition: { duration: 0.3 } }} transition={spring}>
                          <SwipeAlert a={a} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="live" initial={{ opacity: 0, x: 36, filter: "blur(8px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }} exit={{ opacity: 0, x: 28, filter: "blur(6px)", transition: { duration: 0.16 } }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            {eventsStatus === "loading" && <div className="grid place-items-center py-20"><Spinner size={22} /></div>}
            {eventsStatus === "error" && <Notice icon={CloudOff} tone="#ff9f0a" title="NASA EONET isn’t responding" body="Live events are unavailable right now. Measured alerts are unaffected." action={<Button icon={RotateCcw} onClick={() => void useApp.getState().loadEvents(true)}>Try again</Button>} />}
            {eventsStatus === "ready" && (
              <>
                <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <SegmentedControl size="sm" value={cat} onChange={setCat} options={[{ value: "all", label: `All ${events.length}` }, ...cats.map(([value, label]) => ({ value, label }))]} />
                </div>
                {shownEvents.length === 0 && <Notice icon={Check} tone="#30d158" title="No open events" body="NASA EONET lists nothing in this category for the last 30 days." />}
                <div className="flex flex-col gap-2.5">
                  {shownEvents.map((e, i) => (
                    <motion.div key={e.id} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 28, delay: Math.min(i, 10) * 0.035 }}>
                      <EventRow e={e} />
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </ViewScroll>
  );
}
