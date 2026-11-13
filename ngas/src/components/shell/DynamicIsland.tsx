import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { BookmarkCheck, Check, CloudOff, Download, ExternalLink, Layers, MapPin, Satellite, Sparkles, TriangleAlert } from "lucide-react";
import { useApp, type IslandIcon, type IslandTone } from "@/store";
import { useNow } from "@/components/ui/motion";
import { useConnectivity } from "@/hooks/useConnectivity";
import { sfx } from "@/lib/sound";
import { cn } from "@/utils/cn";
import { haptic } from "@/lib/haptics";
import { fmtDate, latestISO } from "@/lib/gibs";

const TONE: Record<IslandTone, string> = {
  blue: "#0a84ff",
  green: "#30d158",
  orange: "#ff9f0a",
  red: "#ff453a",
  purple: "#bf5af2",
  teal: "#64d2ff",
};

const ICONS: Record<IslandIcon, typeof Check> = {
  satellite: Satellite,
  check: Check,
  alert: TriangleAlert,
  download: Download,
  bookmark: BookmarkCheck,
  sparkles: Sparkles,
  layers: Layers,
  link: ExternalLink,
  pin: MapPin,
};

const content = {
  initial: { opacity: 0, scale: 0.85, filter: "blur(8px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { delay: 0.08, duration: 0.3 } },
  exit: { opacity: 0, scale: 0.85, filter: "blur(8px)", transition: { duration: 0.16 } },
};

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 640px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 640px)");
    const fn = () => setWide(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  return wide;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function DynamicIsland() {
  const island = useApp((s) => s.island);
  const clear = useApp((s) => s.clearIsland);
  const [peek, setPeek] = useState(false);
  const wide = useWide();
  const now = useNow(1000);
  const online = useConnectivity();

  useEffect(() => {
    if (!island) return;
    setPeek(false);
    // Sound mirrors the island's colour: green resolves, red/orange warns,
    // the rest get a soft chime. Progress states stay silent.
    if (!island.progress) {
      const t = island.tone ?? "blue";
      if (t === "green") (sfx.success(), haptic("success"));
      else if (t === "red" || t === "orange") (sfx.alert(), haptic("warning"));
      else sfx.chime();
    }
    if (island.duration === 0) return;
    const t = window.setTimeout(() => clear(island.id), island.duration ?? 2600);
    return () => window.clearTimeout(t);
  }, [island, clear]);

  useEffect(() => {
    if (!peek) return;
    const t = window.setTimeout(() => setPeek(false), 6000);
    return () => window.clearTimeout(t);
  }, [peek]);

  const mode: "idle" | "event" | "peek" = island ? "event" : peek ? "peek" : "idle";
  const dims = {
    idle: { width: 168, height: 36, borderRadius: 22 },
    event: { width: wide ? 370 : 330, height: 64, borderRadius: 30 },
    peek: { width: wide ? 380 : 340, height: 132, borderRadius: 36 },
  }[mode];

  // Real clock: GIBS finishes a day's global mosaic after that UTC day ends.
  const latest = latestISO();
  const utc = new Date(now);
  const secondsLeft = 86400 - (utc.getUTCHours() * 3600 + utc.getUTCMinutes() * 60 + utc.getUTCSeconds());
  const countdown = `${pad(Math.floor(secondsLeft / 3600))}:${pad(Math.floor((secondsLeft % 3600) / 60))}:${pad(secondsLeft % 60)}`;
  const dayPct = 1 - secondsLeft / 86400;
  const eventCount = useApp((s) => s.events.length);
  const eventsReady = useApp((s) => s.eventsStatus === "ready");

  const tone = TONE[island?.tone ?? "blue"];
  const Icon = ICONS[island?.icon ?? "satellite"];

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-3 z-[90] justify-center", mode === "idle" ? "hidden sm:flex" : "flex")}>
      <motion.div
        key="island"
        whileHover={!island ? { scale: 1.04 } : undefined}
        whileTap={{ scale: 0.97 }}
        role={island?.action || !island ? "button" : "status"}
        aria-live="polite"
        aria-label={island ? `${island.title}. ${island.subtitle ?? ""}` : "Imagery status"}
        tabIndex={island ? -1 : 0}
        onKeyDown={(event) => {
          if (!island && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            setPeek((p) => !p);
          }
        }}
        initial={false}
        animate={{ ...dims, boxShadow: island ? `0 18px 50px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.14), 0 0 32px -6px ${tone}66` : "0 14px 40px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.14), 0 0 0px 0px rgba(0,0,0,0)" }}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
        onClick={() => {
          if (island?.action) {
            island.action();
            clear(island.id);
          } else if (!island) {
            setPeek((p) => !p);
          }
        }}
        aria-expanded={!island ? peek : undefined}
        className="pointer-events-auto relative max-w-[calc(100vw-16px)] cursor-pointer overflow-hidden bg-black text-white"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {mode === "idle" && (
            !online ? (
              <motion.div key="idle-offline" {...content} className="absolute inset-0 flex items-center justify-between pl-3 pr-3.5">
                <span className="flex items-center gap-1.5">
                  <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="grid place-items-center">
                    <CloudOff size={14} className="text-ios-orange" />
                  </motion.span>
                  <span className="text-[12px] font-semibold tracking-tight text-ios-orange">Offline</span>
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-ios-orange" />
              </motion.div>
            ) : (
            <motion.div key="idle" {...content} className="absolute inset-0 flex items-center justify-between pl-3 pr-3.5">
              <span className="flex items-center gap-1.5">
                <motion.span animate={{ y: [0, -1.5, 0], rotate: [0, 6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="grid place-items-center">
                  <Satellite size={14} className="text-ios-teal" />
                </motion.span>
                <span className="text-[12px] font-semibold tracking-tight">Imagery · {fmtDate(latest, "short")}</span>
              </span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-ios-green/70" />
                <span className="relative h-2 w-2 rounded-full bg-ios-green" />
              </span>
            </motion.div>
            ))}

          {mode === "event" && island && (
            <motion.div key={island.id} {...content} className="absolute inset-0 flex items-center gap-3 px-3.5">
              <motion.span
                initial={{ scale: 0.4, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 16, delay: 0.1 }}
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px]"
                style={{ background: `linear-gradient(180deg, ${tone}, color-mix(in srgb, ${tone} 60%, #000))` }}
              >
                <Icon size={20} strokeWidth={2.4} />
              </motion.span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold tracking-tight">{island.title}</div>
                {island.subtitle && <div className="truncate text-[12px] text-white/55">{island.subtitle}</div>}
              </div>
              {island.actionLabel ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-black"
                >
                  {island.actionLabel}
                </motion.span>
              ) : island.progress ? (
                <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0 animate-spin">
                  <circle cx="13" cy="13" r="10" stroke="white" strokeOpacity="0.15" strokeWidth="3" fill="none" />
                  <circle cx="13" cy="13" r="10" stroke={tone} strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="20 63" />
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0">
                  <circle cx="13" cy="13" r="11" fill={`${tone}33`} />
                  <motion.path
                    d="M8 13.5l3.2 3.2L18 9.8"
                    stroke={tone}
                    strokeWidth="2.6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }}
                  />
                </svg>
              )}
            </motion.div>
          )}

          {mode === "peek" && (
            <motion.div key="peek" {...content} className="absolute inset-0 flex flex-col justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-gradient-to-b from-ios-teal to-ios-blue">
                  <Satellite size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">Newest full day · {fmtDate(latest, "medium")}</div>
                  <div className="truncate text-[12px] text-white/50">
                    NASA GIBS · {eventsReady ? `${eventCount} natural events open` : "daily global mosaics"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[16px] font-semibold tabular-nums text-ios-green">{countdown}</div>
                  <div className="text-[10.5px] text-white/45">until today completes</div>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-[10.5px] font-medium text-white/40">
                  <span>Today (UTC) · still being imaged</span>
                  <span>{Math.round(dayPct * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-ios-teal to-ios-green" animate={{ width: `${dayPct * 100}%` }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
