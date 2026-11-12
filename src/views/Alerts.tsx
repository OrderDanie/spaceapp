import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Archive, Check, CircleAlert, CircleCheck, Info, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { ALERTS, placeById, type Alert, type Severity } from "@/data/places";
import { snapshotUrl } from "@/lib/gibs";
import { ViewScroll } from "@/components/shell/ViewScroll";
import { SatImage } from "@/components/ui/SatImage";
import { Button, SegmentedControl, spring } from "@/components/ui/primitives";

const SEV: Record<Severity, { color: string; icon: LucideIcon }> = {
  critical: { color: "#ff453a", icon: TriangleAlert },
  warning: { color: "#ff9f0a", icon: CircleAlert },
  info: { color: "#0a84ff", icon: Info },
  good: { color: "#30d158", icon: CircleCheck },
};

function AlertBody({ a, unread, count, ghost }: { a: Alert; unread: boolean; count?: number; ghost?: boolean }) {
  const p = placeById(a.placeId);
  const s = SEV[a.severity];
  const Icon = s.icon;
  return (
    <div className="card flex items-start gap-3.5 bg-[#151517] p-4" style={{ borderRadius: 24 }}>
      <div className={cn("flex w-full items-start gap-3.5", ghost && "invisible")}>
        <span
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[13px]"
          style={{ background: `linear-gradient(180deg, ${s.color}, color-mix(in srgb, ${s.color} 58%, #000))` }}
        >
          <Icon size={21} color="#fff" strokeWidth={2.3} />
          <AnimatePresence>
            {unread && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 20 }}
                className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-ios-blue ring-2 ring-[#151517]"
              />
            )}
          </AnimatePresence>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11.5px] font-semibold uppercase tracking-wider text-white/45">{p.name}</span>
            <span className="shrink-0 text-[12px] text-white/40">{a.time}</span>
          </div>
          <div className={cn("mt-0.5 text-[15px] tracking-tight", unread ? "font-semibold text-white" : "font-medium text-white/75")}>{a.title}</div>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/55">{a.body}</p>
          {count && count > 1 ? (
            <div className="mt-2 text-[12px] font-semibold text-[#4aa3ff]">
              +{count - 1} more from {p.name}
            </div>
          ) : null}
        </div>
        <SatImage
          lazy
          showIcon={false}
          src={snapshotUrl({ layer: p.layer, date: p.after, lat: p.lat, lon: p.lon, span: p.span, width: 200, height: 200 })}
          className="hidden h-16 w-16 shrink-0 rounded-[14px] sm:block"
        />
      </div>
    </div>
  );
}

function SwipeAlert({ a }: { a: Alert }) {
  const read = useApp((s) => s.readAlerts.includes(a.id));
  const markRead = useApp((s) => s.markRead);
  const dismiss = useApp((s) => s.dismiss);
  const notify = useApp((s) => s.notify);
  const selectPlace = useApp((s) => s.selectPlace);
  const x = useMotionValue(0);
  const actionsOpacity = useTransform(x, [-150, -30, 0], [1, 0.35, 0]);
  const actionsScale = useTransform(x, [-150, 0], [1, 0.75]);
  const doDismiss = () => {
    dismiss(a.id);
    notify({
      title: "Alert dismissed",
      subtitle: placeById(a.placeId).name,
      icon: "check",
      tone: "blue",
      duration: 4800,
      actionLabel: "Undo",
      action: () => useApp.getState().restoreAlert(a.id),
    });
  };

  return (
    <div className="relative">
      <motion.div style={{ opacity: actionsOpacity, scale: actionsScale }} className="absolute inset-y-0 right-0 flex items-center gap-2 pr-1">
        <button
          onClick={() => {
            markRead(a.id);
            animate(x, 0, spring);
          }}
          className="flex h-[calc(100%-12px)] w-[70px] flex-col items-center justify-center gap-1 rounded-[20px] bg-ios-blue text-[12px] font-semibold"
        >
          <Check size={18} /> Read
        </button>
        <button
          onClick={doDismiss}
          className="flex h-[calc(100%-12px)] w-[70px] flex-col items-center justify-center gap-1 rounded-[20px] bg-ios-red text-[12px] font-semibold"
        >
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
          if (info.offset.x < -230 || info.velocity.x < -1100) {
            doDismiss();
            return;
          }
          animate(x, info.offset.x < -70 ? -160 : 0, spring);
        }}
        onTap={() => {
          if (Math.abs(x.get()) > 4) {
            animate(x, 0, spring);
            return;
          }
          markRead(a.id);
          selectPlace(a.placeId, "compare");
        }}
        whileTap={{ scale: 0.985 }}
        className="relative cursor-grab touch-pan-y active:cursor-grabbing"
      >
        <AlertBody a={a} unread={!read} />
      </motion.div>
    </div>
  );
}

function AlertStack({ items }: { items: Alert[] }) {
  const [open, setOpen] = useState(false);
  const readIds = useApp((s) => s.readAlerts);
  const p = placeById(items[0].placeId);
  const t = { type: "spring", stiffness: 320, damping: 32 } as const;
  return (
    <motion.div layout transition={t}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between overflow-hidden px-1"
          >
            <span className="pb-2 text-[13px] font-semibold text-white/60">
              {p.name} · {items.length} alerts
            </span>
            <button onClick={() => setOpen(false)} className="mb-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/80 transition-colors hover:bg-white/15">
              Show less
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {open ? (
        <div className="flex flex-col gap-2.5">
          {items.map((a) => (
            <motion.div key={a.id} layoutId={`stack-${a.id}`} transition={t} animate={{ scale: 1, y: 0, opacity: 1 }}>
              <SwipeAlert a={a} />
            </motion.div>
          ))}
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="grid w-full text-left" style={{ paddingBottom: Math.min(items.length - 1, 2) * 10 }}>
          {items.slice(0, 3).map((a, i) => (
            <motion.div
              key={a.id}
              layoutId={`stack-${a.id}`}
              transition={t}
              style={{ gridArea: "1 / 1", zIndex: 10 - i, transformOrigin: "bottom center" }}
              animate={{ scale: 1 - i * 0.05, y: i * 10, opacity: i === 0 ? 1 : 0.75 - i * 0.2 }}
              whileHover={i === 0 ? { y: -2 } : undefined}
            >
              <AlertBody a={a} unread={!readIds.includes(a.id)} count={i === 0 ? items.length : undefined} ghost={i > 0} />
            </motion.div>
          ))}
        </button>
      )}
    </motion.div>
  );
}

function EmptyState({ onRestore }: { onRestore: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-20 text-center">
      <div className="relative grid h-28 w-28 place-items-center">
        <motion.div className="absolute inset-0 rounded-full bg-ios-green/15" animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-b from-ios-green to-[#1f9e44] shadow-[0_12px_40px_-10px_rgba(48,209,88,0.8)]"
        >
          <svg width="40" height="40" viewBox="0 0 40 40">
            <motion.path
              d="M11 21l6 6 13-14"
              stroke="white"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
            />
          </svg>
        </motion.div>
      </div>
      <h3 className="mt-6 text-[22px] font-bold tracking-tight">You’re all caught up</h3>
      <p className="mt-1 max-w-xs text-[14px] text-white/50">Epoch will let you know when the next satellite pass detects a change.</p>
      <Button className="mt-5" icon={RotateCcw} onClick={onRestore}>
        Restore alerts
      </Button>
    </motion.div>
  );
}

export function Alerts() {
  const read = useApp((s) => s.readAlerts);
  const dismissed = useApp((s) => s.dismissed);
  const markAllRead = useApp((s) => s.markAllRead);
  const restore = useApp((s) => s.restoreAlerts);
  const notify = useApp((s) => s.notify);
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");

  const visible = ALERTS.filter((a) => !dismissed.includes(a.id)).filter((a) =>
    filter === "all" ? true : filter === "unread" ? !read.includes(a.id) : a.severity === "critical"
  );
  const unread = ALERTS.filter((a) => !dismissed.includes(a.id) && !read.includes(a.id)).length;
  const groups = (["Today", "Yesterday", "This Week"] as const)
    .map((g) => ({ g, items: visible.filter((a) => a.group === g) }))
    .filter((x) => x.items.length);

  return (
    <ViewScroll
      eyebrow="Notifications"
      title="Alerts"
      subtitle={unread ? `${unread} unread · swipe left on a card to triage` : "You’re all caught up"}
      actions={
        <>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "critical", label: "Critical" },
            ]}
          />
          <Button
            icon={Check}
            onClick={() => {
              markAllRead();
              notify({ title: "All caught up", subtitle: "Every alert marked as read", icon: "check", tone: "green" });
            }}
          >
            Mark all read
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-[780px]">
        <AnimatePresence mode="popLayout" initial={false}>
          {groups.length === 0 ? (
            <EmptyState key="empty" onRestore={restore} />
          ) : (
            groups.map(({ g, items }) => {
              const byPlace = new Map<string, Alert[]>();
              items.forEach((a) => byPlace.set(a.placeId, [...(byPlace.get(a.placeId) ?? []), a]));
              return (
                <motion.section key={g} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring} className="mb-8">
                  <h2 className="mb-3 px-1 text-[20px] font-bold tracking-tight">{g}</h2>
                  <div className="flex flex-col gap-2.5">
                    <AnimatePresence initial={false}>
                      {[...byPlace.values()].map((group, i) => (
                        <motion.div
                          key={`${g}-${group[0].placeId}`}
                          layout
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.04 } }}
                          exit={{ opacity: 0, x: -120, height: 0, transition: { duration: 0.32, ease: [0.32, 0.72, 0, 1] } }}
                          transition={spring}
                        >
                          {group.length > 1 ? <AlertStack items={group} /> : <SwipeAlert a={group[0]} />}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.section>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </ViewScroll>
  );
}
