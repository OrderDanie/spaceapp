import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { appleEase } from "@/components/ui/primitives";
import { RollingNumber } from "@/components/ui/motion";
import { sfx } from "@/lib/sound";
import { AppIcon } from "./AppIcon";
import { APP_ICON_MORPH_ID, morphLayout } from "@/hooks/useMorphTargets";

const PHASES = ["Contacting the GIBS grid", "Streaming the latest pass", "Calibrating your orbit"];
const DURATION = 1700; // long enough for the motif, short enough to respect the user's time

/** Deterministic pseudo-random twinkles (stable across renders). */
const TWINKLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 92 + 4}%`,
  top: `${(i * 53 + 7) % 84 + 6}%`,
  size: i % 3 === 0 ? 2.5 : 1.5,
  delay: (i % 7) * 0.45,
  dur: 2.2 + (i % 5) * 0.5,
}));

export function Splash({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState(0);
  const [showSkip, setShowSkip] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    sfx.intro(); // queues itself if audio is still locked
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone();
    };
    // Eased, honest-feeling progress: fast start, gentle landing on 100.
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION);
      setPct(Math.round((1 - Math.pow(1 - t, 3)) * 100));
      setPhase(Math.min(PHASES.length - 1, Math.floor(t * PHASES.length)));
      if (t < 1) raf = requestAnimationFrame(step);
      else window.setTimeout(finish, 260);
    };
    raf = requestAnimationFrame(step);
    const skipHint = window.setTimeout(() => setShowSkip(true), 1000);
    const hardStop = window.setTimeout(finish, DURATION + 4000); // never trap the user
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(skipHint);
      window.clearTimeout(hardStop);
    };
  }, [onDone]);

  return (
    <motion.div
      className="starfield absolute inset-0 z-[200] grid place-items-center"
      exit={{ opacity: 0, scale: 1.08, filter: "blur(14px)" }}
      transition={{ duration: 0.75, ease: appleEase }}
      onClick={() => {
        sfx.tap();
        onDone();
      }}
    >
      {/* twinkling stars */}
      {TWINKLES.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.15, 0.7] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(10,132,255,0.28), transparent 62%)" }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: appleEase }}
      />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          {/* Slow orbital sweep around the mark */}
          <motion.svg
            viewBox="0 0 120 120"
            className="absolute -inset-5 h-[144px] w-[144px] animate-spin-slow opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.5, duration: 1 }}
          >
            <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 7" />
            <circle cx="60" cy="4" r="2.4" fill="#64d2ff" />
          </motion.svg>
          {/* Opening morph: on exit this icon flies into the app's brand mark. */}
          <motion.div
            layoutId={APP_ICON_MORPH_ID}
            initial={{ scale: 0.5, opacity: 0, filter: "blur(12px)", rotate: -8 }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)", rotate: 0, transitionEnd: { filter: "none" } }}
            transition={{ type: "spring", stiffness: 150, damping: 15, delay: 0.15, ...morphLayout }}
            style={{ borderRadius: 23 }}
          >
            <AppIcon size={104} animated />
          </motion.div>
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 12, letterSpacing: "0.3em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "-0.02em" }}
          transition={{ delay: 0.55, duration: 1, ease: appleEase }}
          className="mt-7 text-[38px] font-bold"
        >
          Epoch
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.8, ease: appleEase }}
          className="mt-1 text-[16px] text-white/55"
        >
          Earth, over time.
        </motion.p>

        <div className="mt-10 flex w-44 items-center gap-3">
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-ios-blue to-ios-teal"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.25, ease: "linear" }}
            />
          </div>
          <RollingNumber value={pct} suffix="%" className="w-11 text-[12px] font-semibold text-white/60" stagger={0.01} />
        </div>

        <div className="relative mt-3 h-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={phase}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: appleEase }}
              className="text-[12px] font-medium text-white/45"
            >
              {PHASES[phase]}…
            </motion.p>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showSkip && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 text-[11px] font-medium uppercase tracking-[0.14em] text-white/25"
            >
              Tap anywhere to skip
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-6 text-[11px] text-white/30"
      >
        Imagery · NASA EOSDIS GIBS
      </motion.p>
    </motion.div>
  );
}
