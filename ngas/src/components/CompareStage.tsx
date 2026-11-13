import { animate, motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { SatImage } from "@/components/ui/SatImage";
import { spring } from "@/components/ui/primitives";
import { sfx } from "@/lib/sound";

export type CompareMode = "swipe" | "split" | "fade" | "lens";

/** Spring used by every shared-element morph in the app. */
export const morphTransition = { layout: { type: "spring", stiffness: 240, damping: 30, mass: 0.9 } } as const;
export const stageId = (placeId: string) => `stage-${placeId}`;

/** Content dissolve used when switching Swipe / Split / Fade / Lens. */
const modeSwap = {
  initial: { opacity: 0, scale: 1.025, filter: "blur(12px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  transition: { duration: 0.42, ease: [0.32, 0.72, 0, 1] },
} as const;

function Chip({ children, className, style }: { children: React.ReactNode; className?: string; style?: any }) {
  return (
    <motion.span
      style={style}
      className={cn("pointer-events-none absolute top-4 z-20 rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums text-white glass", className)}
    >
      {children}
    </motion.span>
  );
}

export function CompareStage({
  before,
  after,
  beforeLabel,
  afterLabel,
  mode = "swipe",
  autoSweep = false,
  loop = false,
  labels = true,
  className,
  rounded = "rounded-[28px]",
  layoutId,
  radius = 28,
  priority = false,
  overlay = null,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  mode?: CompareMode;
  autoSweep?: boolean;
  loop?: boolean;
  labels?: boolean;
  className?: string;
  rounded?: string;
  /** Shared-element id — lets the stage morph from a card/hero on another page. */
  layoutId?: string;
  radius?: number;
  /** Fetch these two images ahead of everything else on the page. */
  priority?: boolean;
  /** Transparent change map drawn over the imagery. */
  overlay?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useMotionValue(0.5);
  // A felt detent every tenth of the sweep — sound follows touch, throttled.
  const detent = useRef(5);
  useMotionValueEvent(pos, "change", (v) => {
    const bucket = Math.round(v * 10);
    if (bucket !== detent.current) {
      detent.current = bucket;
      if (draggingRef.current) sfx.scrub();
    }
  });
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const clip = useTransform(pos, (p) => `inset(0 ${(1 - p) * 100}% 0 0)`);
  const left = useTransform(pos, (p) => `${p * 100}%`);
  const bOp = useTransform(pos, [0.06, 0.2], [0, 1]);
  const aOp = useTransform(pos, [0.8, 0.94], [1, 0]);

  const [fade, setFade] = useState(0.5);

  const lx = useMotionValue(50);
  const ly = useMotionValue(50);
  const lr = useMotionValue(120);
  const lxp = useTransform(lx, (v) => `${v}%`);
  const lyp = useTransform(ly, (v) => `${v}%`);
  const ring = useTransform(lr, (r) => r * 2);
  const lensClip = useMotionTemplate`circle(${lr}px at ${lx}% ${ly}%)`;

  const [cross, setCross] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (mode !== "swipe" || interacted || (!autoSweep && !loop)) return;
    const c = loop
      ? animate(pos, [0.5, 0.2, 0.8, 0.5], { duration: 8, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.4, delay: 1.2 })
      : animate(pos, [0.5, 0.25, 0.75, 0.5], { duration: 2.8, ease: [0.45, 0, 0.2, 1], delay: 0.9 });
    return () => c.stop();
  }, [mode, autoSweep, loop, interacted, pos]);

  const relX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 0.5;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const rootStyle = layoutId ? { borderRadius: radius } : undefined;

  if (mode === "split") {
    return (
      <motion.div layoutId={layoutId} transition={morphTransition} style={rootStyle} className={cn("relative overflow-hidden bg-[#06080d]", rounded, className)}>
        <motion.div key="split" {...modeSwap} className="absolute inset-0 grid grid-cols-2 gap-1.5">
          {[
            { src: before, label: `Before · ${beforeLabel}` },
            { src: after, label: `After · ${afterLabel}` },
          ].map((s, i) => (
            <div
              key={i}
              className="relative overflow-hidden"
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setCross({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              onPointerLeave={() => setCross(null)}
            >
              <SatImage src={s.src} priority={priority} className="absolute inset-0" />
              {labels && <Chip className="left-4">{s.label}</Chip>}
              {cross && (
                <div className="pointer-events-none absolute z-10" style={{ left: `${cross.x}%`, top: `${cross.y}%` }}>
                  <div className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_6px_20px_rgba(0,0,0,0.5)]" />
                  <div className="absolute h-px w-20 -translate-x-1/2 bg-white/50" />
                  <div className="absolute h-20 w-px -translate-y-1/2 bg-white/50" />
                </div>
              )}
            </div>
          ))}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div layoutId={layoutId} transition={morphTransition} style={rootStyle} className={cn("relative overflow-hidden bg-[#06080d]", rounded, className)}>
      <motion.div
        key={mode}
        {...modeSwap}
        ref={ref}
        tabIndex={0}
        aria-label={mode === "swipe" ? "Before and after comparison. Use left and right arrows to move the divider." : undefined}
        className={cn("absolute inset-0 touch-none outline-none", mode === "swipe" && "cursor-ew-resize", mode === "lens" && "cursor-none")}
        onPointerDown={(e) => {
          if (mode !== "swipe") return;
          setInteracted(true);
          draggingRef.current = true;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          pos.stop();
          animate(pos, relX(e.clientX), { type: "spring", stiffness: 420, damping: 38 });
        }}
        onPointerMove={(e) => {
          if (mode === "swipe" && dragging) {
            pos.stop();
            pos.set(relX(e.clientX));
          }
          if (mode === "lens") {
            const r = e.currentTarget.getBoundingClientRect();
            lx.set(((e.clientX - r.left) / r.width) * 100);
            ly.set(((e.clientY - r.top) / r.height) * 100);
          }
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        onWheel={(e) => {
          if (mode !== "lens") return;
          animate(lr, Math.min(260, Math.max(50, lr.get() - e.deltaY * 0.4)), { type: "spring", stiffness: 300, damping: 30 });
        }}
        onKeyDown={(e) => {
          if (mode !== "swipe") return;
          if (e.key === "ArrowLeft") animate(pos, Math.max(0, pos.get() - 0.05), spring);
          if (e.key === "ArrowRight") animate(pos, Math.min(1, pos.get() + 0.05), spring);
          setInteracted(true);
        }}
      >
        {mode === "lens" ? (
          <>
            <SatImage src={before} priority={priority} className="absolute inset-0" />
            <motion.div className="absolute inset-0" style={{ clipPath: lensClip }}>
              <SatImage src={after} priority={priority} className="absolute inset-0" showIcon={false} />
            </motion.div>
            <motion.div
              className="pointer-events-none absolute z-10 rounded-full ring-2 ring-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_10px_40px_rgba(0,0,0,0.5),inset_0_0_30px_rgba(255,255,255,0.15)]"
              style={{ left: lxp, top: lyp, width: ring, height: ring, x: "-50%", y: "-50%" }}
            />
          </>
        ) : (
          <>
            <SatImage src={after} priority={priority} className="absolute inset-0" />
            {mode === "swipe" && (
              <motion.div className="absolute inset-0" style={{ clipPath: clip }}>
                <SatImage src={before} priority={priority} className="absolute inset-0" showIcon={false} />
              </motion.div>
            )}
            {mode === "fade" && (
              <motion.div className="absolute inset-0" animate={{ opacity: 1 - fade }} transition={{ duration: 0.25 }}>
                <SatImage src={before} className="absolute inset-0" showIcon={false} />
              </motion.div>
            )}
          </>
        )}

        {overlay && (
          <motion.img
            key={overlay.length}
            src={overlay}
            alt="Change map"
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full object-cover"
            style={{ imageRendering: "pixelated" }}
          />
        )}

        {mode === "swipe" && (
          <motion.div className="pointer-events-none absolute inset-y-0 z-10" style={{ left }}>
            <div className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_18px_rgba(0,0,0,0.65)]" />
            <motion.div
              animate={{ scale: dragging ? 1.14 : 1 }}
              transition={spring}
              className="absolute top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full glass-strong liquid"
            >
              {/* Idle affordance: the arrows breathe sideways until first touched. */}
              <motion.span
                animate={interacted || dragging ? { x: 0 } : { x: [0, -2.5, 2.5, 0] }}
                transition={interacted || dragging ? spring : { duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
                className="grid place-items-center"
              >
                <ChevronsLeftRight size={20} strokeWidth={2.4} />
              </motion.span>
            </motion.div>
          </motion.div>
        )}
      </motion.div>

      {labels && (
        <>
          <Chip className="left-4" style={{ opacity: mode === "swipe" ? bOp : 1 }}>
            {mode === "lens" ? "Base" : "Before"} · {beforeLabel}
          </Chip>
          <Chip className="right-4" style={{ opacity: mode === "swipe" ? aOp : 1 }}>
            {mode === "lens" ? "Lens" : "After"} · {afterLabel}
          </Chip>
        </>
      )}

      {mode === "lens" && (
        <span className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white/75 glass">
          Move to reveal · scroll to resize
        </span>
      )}

      {mode === "fade" && (
        <div className="absolute bottom-4 left-1/2 z-20 flex w-[min(420px,86%)] -translate-x-1/2 items-center gap-3 rounded-full px-4 py-1.5 glass-strong">
          <span className="text-[12px] font-semibold tabular-nums text-white/70">{beforeLabel}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={fade}
            onChange={(e) => setFade(Number(e.target.value))}
            className="ios-range flex-1"
            style={{ ["--p" as string]: `${fade * 100}%` }}
          />
          <span className="text-[12px] font-semibold tabular-nums text-white/70">{afterLabel}</span>
        </div>
      )}
    </motion.div>
  );
}
