import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CornerDownLeft, Globe, Layers, RotateCcw, Search, Settings, Sparkles, Eye, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { sfx } from "@/lib/sound";
import { PLACES } from "@/data/places";
import { LAYERS } from "@/lib/gibs";
import { CategoryIcon, Kbd, spring } from "@/components/ui/primitives";
import { NAV_ITEMS } from "./Sidebar";

/** Shared layoutId: the search trigger morphs into the palette. */
export const PALETTE_MORPH_ID = "palette-shell";

interface Cmd {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

function Glyph({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
      style={{ background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 60%, #000))` }}
    >
      <Icon size={16} color="#fff" strokeWidth={2.3} />
    </span>
  );
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPalette);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const s = () => useApp.getState();
    const places: Cmd[] = PLACES.map((p) => ({
      id: `p-${p.id}`,
      group: "Places",
      title: p.name,
      subtitle: `${p.region} · ${p.category}`,
      keywords: `${p.category} ${p.status} ${p.metric.label}`,
      icon: <CategoryIcon category={p.category} size={32} />,
      run: () => {
        s().selectPlace(p.id, "explore");
        s().notify({ title: `Flying to ${p.name}`, subtitle: p.region, icon: "satellite", tone: "teal", progress: true, duration: 2200 });
      },
    }));
    const views: Cmd[] = NAV_ITEMS.map((n) => ({
      id: `v-${n.id}`,
      group: "Go to",
      title: n.label,
      subtitle: n.hint,
      icon: <Glyph icon={n.icon} color="#3a3a3c" />,
      run: () => s().setView(n.id),
    }));
    const layers: Cmd[] = LAYERS.map((l) => ({
      id: `l-${l.id}`,
      group: "Imagery layers",
      title: l.name,
      subtitle: `${l.sensor} · ${l.resolution}`,
      keywords: "layer band false color",
      icon: <span className="h-8 w-8 shrink-0 rounded-[9px] ring-1 ring-inset ring-white/15" style={{ background: l.swatch }} />,
      run: () => {
        s().setLayer(l.id);
        s().setView("explore");
        s().notify({ title: l.name, subtitle: "Imagery layer applied", icon: "layers", tone: "blue" });
      },
    }));
    const actions: Cmd[] = [
      {
        id: "a-rotate",
        group: "Actions",
        title: "Toggle globe rotation",
        icon: <Glyph icon={Globe} color="#0a84ff" />,
        run: () => s().setSetting("autoRotate", !s().settings.autoRotate),
      },
      {
        id: "a-labels",
        group: "Actions",
        title: "Toggle place labels",
        icon: <Glyph icon={Eye} color="#5e5ce6" />,
        run: () => s().setSetting("showLabels", !s().settings.showLabels),
      },
      {
        id: "a-read",
        group: "Actions",
        title: "Mark all alerts as read",
        icon: <Glyph icon={Check} color="#30d158" />,
        run: () => {
          s().markAllRead();
          s().notify({ title: "All caught up", subtitle: "Alerts marked as read", icon: "check", tone: "green" });
        },
      },
      {
        id: "a-compare",
        group: "Actions",
        title: "Compare Aral Sea · 2000 → 2018",
        icon: <Glyph icon={Sparkles} color="#bf5af2" />,
        run: () => s().selectPlace("aral", "compare"),
      },
      {
        id: "a-restore",
        group: "Actions",
        title: "Restore dismissed alerts",
        icon: <Glyph icon={RotateCcw} color="#ff9f0a" />,
        run: () => s().restoreAlerts(),
      },
      {
        id: "a-settings",
        group: "Actions",
        title: "Open Settings",
        icon: <Glyph icon={Settings} color="#8e8e93" />,
        run: () => s().setSettings(true),
      },
    ];
    return [...places, ...views, ...layers, ...actions];
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      return commands.filter((c) =>
        ["p-aral", "p-mead", "p-rondonia", "p-sindh", "v-explore", "v-compare", "v-timelapse", "l-landwater", "a-compare"].includes(c.id)
      );
    }
    return commands.filter((c) => `${c.title} ${c.subtitle ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(term));
  }, [q, commands]);

  useEffect(() => {
    if (open) {
      sfx.whoosh();
      setQ("");
      setActive(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c?: Cmd) => {
    if (!c) return;
    sfx.select();
    setOpen(false);
    window.setTimeout(c.run, 120);
  };

  const groups = results.reduce<Record<string, Cmd[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});
  let idx = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-[100]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <div className="pointer-events-none absolute inset-x-0 top-[12vh] flex justify-center">
          <motion.div
            layoutId={PALETTE_MORPH_ID}
            initial={{ opacity: 0, scale: 0.96, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.97, filter: "blur(8px)", transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32, layout: { type: "spring", stiffness: 300, damping: 32 } }}
            style={{ borderRadius: 24 }}
            className="pointer-events-auto flex max-h-[68vh] w-[min(660px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] glass-strong"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-5">
              <Search size={20} className="text-white/45" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(results.length - 1, a + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === "Enter") {
                    run(results[active]);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                placeholder="Search places, layers and actions"
                className="h-16 flex-1 bg-transparent text-[19px] font-medium tracking-tight text-white outline-none placeholder:text-white/30"
              />
              <Kbd>esc</Kbd>
            </div>

            <div ref={listRef} className="scroll-area min-h-0 flex-1 overflow-y-auto p-2">
              {results.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 py-14 text-center">
                  <Layers size={28} className="text-white/20" />
                  <p className="text-[14px] font-medium text-white/50">No results for “{q}”</p>
                  <p className="text-[12px] text-white/30">Try a place, a layer or “compare”.</p>
                </motion.div>
              )}
              {Object.entries(groups).map(([group, items]) => (
                <div key={group} className="mb-1">
                  <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35">
                    {q ? group : group === "Places" ? "Suggested places" : group}
                  </div>
                  {items.map((c) => {
                    idx += 1;
                    const i = idx;
                    const isActive = i === active;
                    return (
                      <motion.button
                        key={c.id}
                        data-idx={i}
                        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ type: "spring", stiffness: 380, damping: 30, delay: Math.min(i, 10) * 0.025 }}
                        whileTap={{ scale: 0.985 }}
                        onMouseMove={() => setActive(i)}
                        onClick={() => run(c)}
                        className="relative flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left"
                      >
                        {isActive && (
                          <motion.span
                            layoutId="palette-active"
                            className="absolute inset-0 rounded-[14px] bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                            transition={spring}
                          />
                        )}
                        <motion.span animate={{ scale: isActive ? 1.08 : 1, rotate: isActive ? -3 : 0 }} transition={spring} className="relative">
                          {c.icon}
                        </motion.span>
                        <span className="relative min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-white">{c.title}</span>
                          {c.subtitle && <span className="block truncate text-[12px] text-white/45">{c.subtitle}</span>}
                        </span>
                        <motion.span
                          initial={false}
                          animate={{ opacity: isActive ? 1 : 0, x: isActive ? 0 : -6 }}
                          className={cn("relative grid h-6 w-6 place-items-center rounded-md bg-white/10")}
                        >
                          <CornerDownLeft size={13} className="text-white/70" />
                        </motion.span>
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-white/[0.07] px-5 py-2.5 text-[11.5px] text-white/40">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> open
              </span>
              <span className="ml-auto">Imagery courtesy NASA GIBS</span>
            </div>
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
