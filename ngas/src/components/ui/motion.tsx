import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { sfx } from "@/lib/sound";

/* ----------------------------- Stagger helpers ---------------------------- */
export const staggerContainer = (stagger = 0.06, delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.985, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    // A lingering `filter` turns the element into a backdrop root and kills child glass blur.
    transitionEnd: { filter: "none" },
    transition: { type: "spring", stiffness: 220, damping: 26 },
  },
};

export function Stagger({ children, className, stagger = 0.06, delay = 0.04 }: { children: ReactNode; className?: string; stagger?: number; delay?: number }) {
  return (
    <motion.div className={className} variants={staggerContainer(stagger, delay)} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function Item({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={fadeUp} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/** Springs into place the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 32, scale: 0.975 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -6% 0px" }}
      onViewportEnter={() => sfx.reveal()}
      transition={{ type: "spring", stiffness: 190, damping: 26, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ RollingNumber ----------------------------- */
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const LH = "1.12em";

function Digit({ d, delay }: { d: number; delay: number }) {
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: LH, lineHeight: LH }}>
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        initial={{ y: "0%" }}
        animate={{ y: `${-d * 10}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.9, delay }}
      >
        {DIGITS.map((n) => (
          <span key={n} style={{ height: LH, lineHeight: LH }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Apple-style numeric content transition — each digit rolls independently. */
export function RollingNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  signed = false,
  className,
  stagger = 0.03,
  group = true,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  signed?: boolean;
  className?: string;
  stagger?: number;
  /** Thousands separators. Turn off for things that are not quantities (years). */
  group?: boolean;
}) {
  const str = useMemo(() => {
    const abs = Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: group,
    });
    const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
    return sign + abs;
  }, [value, decimals, signed, group]);
  const chars = str.split("");
  return (
    <span className={cn("inline-flex items-center tabular-nums", className)} aria-label={`${prefix}${str}${suffix}`}>
      {prefix && <span style={{ height: LH, lineHeight: LH }}>{prefix}</span>}
      {chars.map((ch, i) => {
        const place = chars.length - i;
        return /\d/.test(ch) ? (
          <Digit key={`d${place}`} d={Number(ch)} delay={i * stagger} />
        ) : (
          <span key={`s${place}${ch}`} style={{ height: LH, lineHeight: LH }}>
            {ch}
          </span>
        );
      })}
      {suffix && <span style={{ height: LH, lineHeight: LH }}>{suffix}</span>}
    </span>
  );
}

/* -------------------------------- TiltCard -------------------------------- */
export function TiltCard({
  children,
  className,
  intensity = 2,
  glare = false,
  ...rest
}: HTMLMotionProps<"div"> & { intensity?: number; glare?: boolean; children: ReactNode }) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [intensity, -intensity]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-intensity, intensity]), { stiffness: 200, damping: 20 });
  const gx = useTransform(mx, (v) => `${v * 100}%`);
  const gy = useTransform(my, (v) => `${v * 100}%`);
  const bg = useMotionTemplate`radial-gradient(500px circle at ${gx} ${gy}, rgba(255,255,255,0.16), transparent 42%)`;
  return (
    <motion.div
      {...rest}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        mx.set(0.5);
        my.set(0.5);
      }}
      whileTap={rest.whileTap ?? { scale: 0.985 }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000, ...(rest.style ?? {}) }}
      className={cn("group relative", className)}
    >
      {children}
      {glare && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: bg }}
        />
      )}
    </motion.div>
  );
}

/* -------------------------------- useMeasure ------------------------------ */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Live-ticking clock hook (1s). */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useLayoutEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}
