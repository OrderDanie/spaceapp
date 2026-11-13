import { AnimatePresence, motion, useDragControls } from "framer-motion";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Bell, Check, ExternalLink, Eye, Globe, Info, Layers, MapPin, Play, SlidersHorizontal, Sparkles, Volume2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { previewSounds } from "@/lib/sound";
import { useOpenSound } from "@/hooks/useOpenSound";
import { refractionSupported } from "@/lib/liquidGlass";
import { LAYERS } from "@/lib/gibs";
import { Switch } from "@/components/ui/primitives";

function Group({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <motion.section
      variants={{ hidden: { opacity: 0, y: 26, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1 } }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="mb-7"
    >
      <h3 className="mb-1.5 px-4 text-[12.5px] font-medium uppercase tracking-[0.04em] text-white/45">{title}</h3>
      <div className="overflow-hidden rounded-[16px] bg-white/[0.06] ring-1 ring-inset ring-white/[0.04]">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12.5px] leading-snug text-white/40">{footer}</p>}
    </motion.section>
  );
}

function Row({
  icon: Icon,
  color,
  label,
  sub,
  children,
  last,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  sub?: string;
  children?: ReactNode;
  last?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn("flex min-h-[50px] items-center gap-3 pl-3.5 pr-3.5 transition-colors", onClick && "cursor-pointer active:bg-white/[0.06] hover:bg-white/[0.03]")}
    >
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px]" style={{ background: color }}>
        <Icon size={17} color="#fff" strokeWidth={2.2} />
      </span>
      <div className={cn("flex flex-1 items-center justify-between gap-3 self-stretch py-2.5", !last && "border-b border-white/[0.08]")}>
        <div className="min-w-0">
          <div className="text-[15px] text-white">{label}</div>
          {sub && <div className="text-[12px] text-white/45">{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SettingsSheet() {
  const open = useApp((s) => s.settingsOpen);
  useOpenSound(open);
  const setOpen = useApp((s) => s.setSettings);
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const layer = useApp((s) => s.layer);
  const setLayer = useApp((s) => s.setLayer);
  const controls = useDragControls();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-[95] bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-label="Settings"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 650) setOpen(false);
            }}
            className="absolute inset-x-0 bottom-0 z-[96] mx-auto flex h-[88vh] max-w-[640px] flex-col rounded-t-[36px] glass-strong"
          >
            <div onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none active:cursor-grabbing">
              <div className="mx-auto mt-2.5 h-[5px] w-10 rounded-full bg-white/25" />
              <header className="flex items-center justify-between px-6 pb-3 pt-3">
                <span className="w-14" />
                <h2 className="text-[17px] font-semibold">Settings</h2>
                <button onClick={() => setOpen(false)} className="w-14 text-right text-[17px] font-semibold text-[#3d9bff] active:opacity-60">
                  Done
                </button>
              </header>
            </div>

            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.18 } } }}
              className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-2"
            >
              <Group title="Default imagery" footer="All imagery is streamed live from NASA’s Global Imagery Browse Services (GIBS).">
                {LAYERS.map((l, i) => (
                  <Row
                    key={l.id}
                    icon={Layers}
                    color={["#0a84ff", "#30d158", "#5e5ce6", "#ff9f0a"][i]}
                    label={l.name}
                    sub={`${l.sensor} · ${l.resolution}`}
                    last={i === LAYERS.length - 1}
                    onClick={() => setLayer(l.id)}
                  >
                    <AnimatePresence>
                      {layer === l.id && (
                        <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                          <Check size={18} strokeWidth={2.8} className="text-[#3d9bff]" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Row>
                ))}
              </Group>

              <Group title="Globe">
                <Row icon={Globe} color="#0a84ff" label="Auto-rotate" sub="Slowly spin the globe when idle">
                  <Switch checked={settings.autoRotate} onChange={(v) => setSetting("autoRotate", v)} label="Auto-rotate" />
                </Row>
                <Row icon={MapPin} color="#ff375f" label="Place labels" sub="Always show names on the map">
                  <Switch checked={settings.showLabels} onChange={(v) => setSetting("showLabels", v)} label="Place labels" />
                </Row>
                <Row icon={Sparkles} color="#bf5af2" label="HD snapshots" sub="Request 2× resolution images">
                  <Switch checked={settings.hdImagery} onChange={(v) => setSetting("hdImagery", v)} label="HD snapshots" />
                </Row>
                <Row icon={Layers} color="#ff9f0a" label="Flat map" sub="Mercator projection instead of the 3D globe" last>
                  <Switch checked={settings.flatMap} onChange={(v) => setSetting("flatMap", v)} label="Flat map" />
                </Row>
              </Group>

              <Group title="Alerts" footer="Alerts are written by the analyst when a place’s measured trend moves — never scripted.">
                <Row icon={Bell} color="#ff453a" label="Announce on launch" sub="Mention unread measured changes when Epoch opens" last>
                  <Switch checked={settings.announceAlerts} onChange={(v) => setSetting("announceAlerts", v)} label="Announce on launch" />
                </Row>
              </Group>

              <Group title="Sound" footer="Quiet, synthesized on this device — there are no audio files. Kept well below notification volume, and never the only feedback.">
                <Row icon={Volume2} color="#0a84ff" label="Sound effects" sub="Every touch and move, kept soft">
                  <Switch checked={settings.sounds} onChange={(v) => setSetting("sounds", v)} label="Sound effects" />
                </Row>
                <Row icon={Volume2} color="#64d2ff" label="Movement sounds" sub="Hovering, scrolling and dragging">
                  <Switch checked={settings.moveSounds} onChange={(v) => setSetting("moveSounds", v)} label="Movement sounds" />
                </Row>
                <Row icon={SlidersHorizontal} color="#bf5af2" label="Haptics" sub="A light tick under your finger on supported phones">
                  <Switch checked={settings.haptics} onChange={(v) => setSetting("haptics", v)} label="Haptics" />
                </Row>
                <Row icon={Play} color="#30d158" label="Preview" sub="Hear the confirmation sounds" last onClick={() => previewSounds()}>
                  <span className="text-[14px] font-medium text-[#3d9bff]">Play</span>
                </Row>
              </Group>

              <Group title="General" footer={refractionSupported ? undefined : "This browser cannot bend a backdrop through glass (only Chromium browsers can), so surfaces here are frosted and lit but do not refract."}>
                <Row icon={Sparkles} color="#64d2ff" label="Liquid glass refraction" sub="Glass edges bend what is behind them">
                  {refractionSupported ? (
                    <Switch checked={settings.refraction} onChange={(v) => setSetting("refraction", v)} label="Liquid glass refraction" />
                  ) : (
                    <span className="text-[14px] text-white/40">Unavailable</span>
                  )}
                </Row>
                <Row icon={Eye} color="#30d158" label="Reduce motion" sub="Minimise animations across Epoch" last>
                  <Switch checked={settings.reduceMotion} onChange={(v) => setSetting("reduceMotion", v)} label="Reduce motion" />
                </Row>
              </Group>

              <Group title="About">
                <Row icon={Info} color="#8e8e93" label="Data sources" sub="NASA GIBS imagery · NASA EONET events · OpenStreetMap search">
                  <a
                    href="https://nasa-gibs.github.io/gibs-api-docs/"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[14px] text-[#3d9bff]"
                  >
                    Docs <ExternalLink size={13} />
                  </a>
                </Row>
                <Row icon={Sparkles} color="#3a3a3c" label="Version" last>
                  <span className="text-[14px] text-white/40">2.0 · spectral engine 3</span>
                </Row>
              </Group>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
