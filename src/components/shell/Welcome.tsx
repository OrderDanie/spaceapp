import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bell, Columns2, Film, Satellite, Sparkles, X } from "lucide-react";
import { useApp } from "@/store";
import { GlobeCSS } from "@/components/GlobeCSS";
import { Button, IconButton, appleEase } from "@/components/ui/primitives";
import { sfx } from "@/lib/sound";
import { AppIcon } from "./AppIcon";

const FEATURES: { icon: LucideIcon; color: string; title: string; sub: string }[] = [
  { icon: Columns2, color: "#ff9f0a", title: "Compare any two moments", sub: "Swipe between dates, side by side, or through a lens." },
  { icon: Film, color: "#bf5af2", title: "Decades in seconds", sub: "Year-by-year timelapses drawn from the archive." },
  { icon: Bell, color: "#ff453a", title: "Know when it changes", sub: "Epoch watches your places and flags what's new." },
];

const rise = (delay: number) =>
  ({
    initial: { opacity: 0, y: 16, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } },
    transition: { type: "spring", stiffness: 300, damping: 28, delay },
  }) as const;

/** One-time, task-first welcome shown after the launch animation. */
export function Welcome() {
  const complete = useApp((s) => s.completeWelcome);
  const setView = useApp((s) => s.setView);
  const primary = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  // Gentle parallax — the card leans a few degrees toward the pointer.
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [3.2, -3.2]), { stiffness: 180, damping: 22 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-3.2, 3.2]), { stiffness: 180, damping: 22 });

  useEffect(() => {
    const t = window.setTimeout(() => primary.current?.focus(), 450);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") complete();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", key);
    };
  }, [complete]);

  const start = (view: "today" | "explore") => {
    complete();
    setView(view);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="absolute inset-0 z-[190] grid place-items-center overflow-hidden bg-black/55 p-3 backdrop-blur-xl sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="pointer-events-none absolute h-[680px] w-[680px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(10,132,255,0.24), transparent 64%)" }}
        initial={{ scale: 0.65, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.15, opacity: 0 }}
        transition={{ duration: 1.2, ease: appleEase }}
      />

      <motion.section
        initial={{ opacity: 0, y: 34, scale: 0.93, filter: "blur(14px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
        exit={{ opacity: 0, y: 18, scale: 1.03, filter: "blur(10px)" }}
        transition={{ type: "spring", stiffness: 240, damping: 27, delay: 0.12 }}
        style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1200 }}
        onPointerMove={(e) => {
          if (reduce) return;
          const r = e.currentTarget.getBoundingClientRect();
          mx.set((e.clientX - r.left) / r.width);
          my.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          mx.set(0.5);
          my.set(0.5);
        }}
        className="scroll-area relative grid max-h-full w-full max-w-[820px] overflow-y-auto rounded-[36px] glass-strong liquid sm:grid-cols-[0.9fr_1.1fr] sm:overflow-hidden"
      >
        {/* Light travelling along the top edge */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 z-10 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)", backgroundSize: "40% 100%", backgroundRepeat: "no-repeat" }}
          initial={{ backgroundPosition: "-40% 0" }}
          animate={{ backgroundPosition: "140% 0" }}
          transition={{ duration: 2.6, delay: 0.9, ease: appleEase }}
        />
        <IconButton
          icon={X}
          label="Skip welcome"
          variant="solid"
          className="absolute right-4 top-4 z-20"
          onClick={() => {
            sfx.settle();
            complete();
          }}
        />

        <div className="relative hidden min-h-[540px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(10,132,255,0.2),transparent_60%)] sm:flex">
          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -10, y: 16 }}
            animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 17, delay: 0.35 }}
          >
            <GlobeCSS size={190} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.62 }}
            className="absolute bottom-7 left-7 right-7 flex items-center justify-between rounded-full px-4 py-2.5 glass"
          >
            <span className="flex items-center gap-2 text-[12px] font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-ios-green" />
                <span className="relative rounded-full bg-ios-green" />
              </span>
              NASA GIBS live
            </span>
            <span className="text-[11.5px] text-white/45">Daily Earth imagery</span>
          </motion.div>
        </div>

        <div className="flex min-h-0 flex-col justify-center px-6 py-10 sm:min-h-[540px] sm:px-10">
          <motion.div {...rise(0.3)} className="flex items-center gap-3">
            <AppIcon size={48} animated />
            <div>
              <div className="text-[28px] font-bold tracking-[-0.035em]">Epoch</div>
              <div className="text-[12.5px] font-medium text-white/45">Earth, over time</div>
            </div>
          </motion.div>

          <motion.div {...rise(0.42)}>
            <h1 id="welcome-title" className="mt-8 text-[30px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[36px]">
              See what changed.<br />Understand why.
            </h1>
            <p className="mt-3.5 max-w-sm text-[15px] leading-relaxed text-white/55">
              Scrub through daily satellite passes, compare two moments, and keep watch over the places that matter to you.
            </p>
          </motion.div>

          <div className="mt-6 space-y-1">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title} {...rise(0.52 + i * 0.09)} className="group flex items-center gap-3 rounded-[18px] px-2 py-2 -mx-2 transition-colors hover:bg-white/[0.04]">
                  <motion.span
                    initial={{ scale: 0.4, rotate: -18 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 15, delay: 0.58 + i * 0.09 }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] transition-transform duration-300 ease-apple group-hover:scale-110 group-hover:-rotate-6"
                    style={{ background: `linear-gradient(180deg, ${f.color}, color-mix(in srgb, ${f.color} 58%, #000))`, boxShadow: `0 6px 16px -6px ${f.color}` }}
                  >
                    <Icon size={17} color="#fff" strokeWidth={2.3} />
                  </motion.span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold tracking-tight">{f.title}</div>
                    <div className="truncate text-[12.5px] text-white/45">{f.sub}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div {...rise(0.82)} className="mt-7 flex flex-col gap-2.5">
            <Button
              ref={primary}
              variant="blue"
              size="lg"
              icon={Satellite}
              className="w-full justify-between px-5"
              onClick={() => start("explore")}
            >
              <span>Explore Earth</span>
              <ArrowRight size={17} />
            </Button>
            <Button variant="glass" size="lg" icon={Sparkles} className="w-full" onClick={() => start("today")}>
              Open my daily briefing
            </Button>
          </motion.div>

          <motion.p {...rise(0.94)} className="mt-4 text-center text-[11.5px] text-white/30">
            Public NASA imagery. No account, no API key — press <span className="text-white/50">esc</span> to skip.
          </motion.p>
        </div>
      </motion.section>
    </motion.div>
  );
}
