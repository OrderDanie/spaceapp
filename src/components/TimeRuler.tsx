import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { addDays, diffDays, MONTHS } from "@/lib/gibs";
import { useMeasure } from "@/components/ui/motion";

const PX = 11; // pixels per day
const W = 75; // days rendered on each side of the anchor
const REBASE_AT = W - 24; // re-anchor before the visible window runs out

function Tick({ i, iso, offset, disabled }: { i: number; iso: string; offset: MotionValue<number>; disabled: boolean }) {
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7));
  const isMonth = day === 1;
  const isYear = isMonth && month === 1;
  const scaleY = useTransform(offset, (o) => 1 + Math.max(0, 1 - Math.abs(i - W - o) / 5) * 0.9);
  const opacity = useTransform(offset, (o) => (disabled ? 0.1 : Math.max(0.25, 1 - Math.abs(i - W - o) / 34)));
  // Month labels lift slightly as they pass under the needle.
  const labelY = useTransform(offset, (o) => -Math.max(0, 1 - Math.abs(i - W - o) / 6) * 3);
  return (
    <div className="absolute bottom-2" style={{ left: i * PX }}>
      <motion.div
        style={{ scaleY, opacity }}
        className={cn(
          "w-[2px] origin-bottom -translate-x-1/2 rounded-full",
          isMonth ? "h-[18px] bg-white" : day % 7 === 1 ? "h-[11px] bg-white/85" : "h-[8px] bg-white/60"
        )}
      />
      {isMonth && (
        <motion.span
          style={{ opacity, y: labelY }}
          className={cn(
            "absolute bottom-[25px] -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold",
            isYear ? "text-ios-teal" : "text-white/75"
          )}
        >
          {isYear ? iso.slice(0, 4) : MONTHS[month - 1]}
        </motion.span>
      )}
    </div>
  );
}

/** Apple-style scrubbing dial: drag, flick, scroll or click to pick a day. */
export function TimeRuler({
  date,
  min,
  max,
  onChange,
  onPreview,
  className,
}: {
  date: string;
  min: string;
  max: string;
  onChange: (d: string) => void;
  onPreview?: (d: string) => void;
  className?: string;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [anchor, setAnchorState] = useState(date);
  // Live mirror of `anchor` — event handlers and animation callbacks must
  // never read a stale render's anchor.
  const anchorRef = useRef(date);
  const rebaseTo = useRef<number | null>(null);
  const offset = useMotionValue(0);
  const widthMV = useMotionValue(0);
  const needle = useMotionValue(1);
  const committed = useRef(date);
  const shown = useRef(date);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<{ x0: number; o0: number; lx: number; lt: number; v: number; moved: number } | null>(null);
  const wheelT = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [label, setLabel] = useState(date);

  const setAnchor = (a: string) => {
    anchorRef.current = a;
    setAnchorState(a);
  };

  useEffect(() => widthMV.set(width), [width, widthMV]);
  useEffect(() => () => window.clearTimeout(wheelT.current), []);

  const bounds = () => ({ lo: diffDays(min, anchorRef.current), hi: diffDays(max, anchorRef.current) });
  const clamp = (v: number) => {
    const { lo, hi } = bounds();
    return Math.min(hi, Math.max(lo, v));
  };

  const days = useMemo(() => Array.from({ length: W * 2 + 1 }, (_, i) => addDays(anchor, i - W)), [anchor]);
  const x = useTransform([offset, widthMV], ([o, w]) => (w as number) / 2 - (W + (o as number)) * PX);

  useMotionValueEvent(offset, "change", (v) => {
    const d = addDays(anchorRef.current, Math.round(v));
    if (d !== shown.current) {
      shown.current = d;
      onPreview?.(d);
      setLabel(d);
      // Detent: a tiny needle "tick" each time a new day passes under it.
      animate(needle, [1.32, 1], { duration: 0.22, ease: [0.2, 0.8, 0.3, 1] });
    }
  });

  useLayoutEffect(() => {
    if (rebaseTo.current !== null) {
      offset.jump(rebaseTo.current);
      rebaseTo.current = null;
    } else {
      offset.jump(diffDays(committed.current, anchor));
    }
  }, [anchor, offset]);

  /** Shift the anchor under an in-flight gesture without any visible jump. */
  const rebase = (o: number) => {
    const shift = Math.round(o);
    if (shift === 0) return o;
    const next = o - shift;
    rebaseTo.current = next;
    if (drag.current) drag.current.o0 -= shift;
    setAnchor(addDays(anchorRef.current, shift));
    offset.jump(next);
    return next;
  };

  const commit = (d: string) => {
    committed.current = d;
    shown.current = d;
    onPreview?.(d);
    setLabel(d);
    if (d !== date) onChange(d);
    setAnchor(d);
  };

  const settle = (velocity = 0, target?: number) => {
    anim.current?.stop();
    const t = clamp(Math.round(target ?? offset.get() + velocity * 0.18));
    const base = anchorRef.current;
    anim.current = animate(offset, t, {
      type: "spring",
      stiffness: 260,
      damping: 34,
      velocity,
      onComplete: () => commit(addDays(base, t)),
    });
  };

  // External date changes (play button, year stepper, deep links).
  useEffect(() => {
    if (date === committed.current) return;
    committed.current = date;
    setLabel(date);
    const t = diffDays(date, anchorRef.current);
    anim.current?.stop();
    if (Math.abs(t) > REBASE_AT) {
      shown.current = date;
      onPreview?.(date);
      setAnchor(date);
      return;
    }
    anim.current = animate(offset, t, { type: "spring", stiffness: 220, damping: 30, onComplete: () => setAnchor(date) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label="Imagery date"
      aria-valuetext={label}
      className={cn(
        "mask-fade-x relative h-14 touch-none select-none overflow-hidden outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      onPointerDown={(e) => {
        anim.current?.stop();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x0: e.clientX, o0: offset.get(), lx: e.clientX, lt: performance.now(), v: 0, moved: 0 };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x0;
        d.moved = Math.max(d.moved, Math.abs(dx));
        const { lo, hi } = bounds();
        let o = d.o0 - dx / PX;
        if (o < lo) o = lo - (lo - o) * 0.3; // rubber-band past the ends
        if (o > hi) o = hi + (o - hi) * 0.3;
        if (Math.abs(o) > REBASE_AT && o > lo && o < hi) o = rebase(o);
        offset.set(o);
        const now = performance.now();
        const dt = (now - d.lt) / 1000;
        if (dt > 0.001) {
          d.v = 0.8 * (-(e.clientX - d.lx) / PX / dt) + 0.2 * d.v;
          d.lx = e.clientX;
          d.lt = now;
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (!d) return;
        if (d.moved < 4) {
          const r = e.currentTarget.getBoundingClientRect();
          settle(0, offset.get() + (e.clientX - (r.left + r.width / 2)) / PX);
        } else settle(Math.max(-70, Math.min(70, d.v)));
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        settle(0);
      }}
      onWheel={(e) => {
        anim.current?.stop();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        let o = clamp(offset.get() + delta / PX / 1.4);
        if (Math.abs(o) > REBASE_AT) o = rebase(o);
        offset.set(o);
        window.clearTimeout(wheelT.current);
        wheelT.current = window.setTimeout(() => settle(0), 160);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          settle(0, Math.round(offset.get()) - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          settle(0, Math.round(offset.get()) + 1);
        }
      }}
    >
      <motion.div className="absolute inset-y-0 left-0" style={{ x }}>
        {days.map((iso, i) => (
          <Tick key={`${anchor}-${i}`} i={i} iso={iso} offset={offset} disabled={iso < min || iso > max} />
        ))}
      </motion.div>
      <motion.div
        style={{ scaleY: needle }}
        className="pointer-events-none absolute bottom-1 top-2 left-1/2 w-[3px] origin-bottom -translate-x-1/2 rounded-full bg-ios-blue shadow-[0_0_14px_rgba(10,132,255,0.95)]"
      />
      <motion.div
        style={{ scale: needle }}
        className="pointer-events-none absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-ios-blue ring-2 ring-black/40"
      />
    </div>
  );
}
