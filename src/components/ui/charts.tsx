import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { safeId, spring } from "./primitives";
import { useMeasure } from "./motion";

export function smoothPath(pts: number[][]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/* -------------------------------- Sparkline ------------------------------- */
export function Sparkline({
  values,
  color = "#0a84ff",
  width = 120,
  height = 36,
  strokeWidth = 2,
  fill = true,
  delay = 0,
  className,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  delay?: number;
  className?: string;
}) {
  const id = safeId(useId());
  const { line, area, last } = useMemo(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 3;
    const pts = values.map((v, i) => [
      pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2),
      pad + (1 - (v - min) / range) * (height - pad * 2),
    ]);
    const line = smoothPath(pts);
    const area = `${line} L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z`;
    return { line, area, last: pts[pts.length - 1] };
  }, [values, width, height]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)}>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <motion.path
          d={area}
          fill={`url(#sp${id})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5, duration: 0.9 }}
        />
      )}
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.3, delay, ease: [0.32, 0.72, 0, 1] }}
      />
      <motion.circle
        cx={last[0]}
        cy={last[1]}
        r={3}
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...spring, delay: delay + 1.2 }}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}

/* ---------------------------------- Rings --------------------------------- */
export function Rings({
  rings,
  size = 168,
  stroke = 16,
  gap = 3,
}: {
  rings: { value: number; from: string; to: string }[];
  size?: number;
  stroke?: number;
  gap?: number;
}) {
  const id = safeId(useId());
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
      <defs>
        {rings.map((r, i) => (
          <linearGradient key={i} id={`rg${id}${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={r.from} />
            <stop offset="100%" stopColor={r.to} />
          </linearGradient>
        ))}
      </defs>
      {rings.map((r, i) => {
        const radius = c - stroke / 2 - i * (stroke + gap);
        const circ = 2 * Math.PI * radius;
        return (
          <g key={i}>
            <circle cx={c} cy={c} r={radius} stroke={r.from} strokeOpacity={0.16} strokeWidth={stroke} fill="none" />
            <motion.circle
              cx={c}
              cy={c}
              r={radius}
              stroke={`url(#rg${id}${i})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ * (1 - Math.min(1, r.value)) }}
              transition={{ type: "spring", stiffness: 32, damping: 14, delay: 0.35 + i * 0.18 }}
              style={{ filter: `drop-shadow(0 0 8px ${r.from}66)` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------- LineChart ------------------------------- */
export function LineChart({
  data,
  color = "#0a84ff",
  height = 200,
  activeIndex,
  onSelect,
  unit = "",
  decimals = 0,
  className,
}: {
  data: { year: number; value: number }[];
  color?: string;
  height?: number;
  activeIndex?: number;
  onSelect?: (i: number) => void;
  unit?: string;
  decimals?: number;
  className?: string;
}) {
  const id = safeId(useId());
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 10;
  const padR = 10;
  const padT = 18;
  const padB = 28;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = Math.max(1, width - padL - padR);
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - min) / range) * (height - padT - padB);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const line = width ? smoothPath(pts) : "";
  const area = width ? `${line} L ${x(data.length - 1)} ${height - padB} L ${x(0)} ${height - padB} Z` : "";
  const idx = hover ?? activeIndex ?? null;
  const step = Math.ceil(data.length / 6);
  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="overflow-visible"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - padL) / innerW) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
          onClick={() => hover !== null && onSelect?.(hover)}
        >
          <defs>
            <linearGradient id={`lc${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={padL}
              x2={width - padR}
              y1={padT + t * (height - padT - padB)}
              y2={padT + t * (height - padT - padB)}
              stroke="white"
              strokeOpacity={0.07}
              strokeDasharray="2 4"
            />
          ))}
          <motion.path d={area} fill={`url(#lc${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, ease: [0.32, 0.72, 0, 1] }}
            style={{ filter: `drop-shadow(0 4px 10px ${color}55)` }}
          />
          {data.map((d, i) =>
            i % step === 0 || i === data.length - 1 ? (
              <text key={d.year} x={x(i)} y={height - 8} textAnchor="middle" className="fill-white/35 text-[10.5px] font-medium">
                {d.year}
              </text>
            ) : null
          )}
          {idx !== null && (
            <g>
              <motion.line
                initial={false}
                animate={{ x1: x(idx), x2: x(idx) }}
                transition={spring}
                y1={padT - 6}
                y2={height - padB}
                stroke="white"
                strokeOpacity={0.3}
                strokeDasharray="3 3"
              />
              <motion.circle initial={false} animate={{ cx: x(idx), cy: y(values[idx]) }} transition={spring} r={11} fill={color} fillOpacity={0.22} />
              <motion.circle
                initial={false}
                animate={{ cx: x(idx), cy: y(values[idx]) }}
                transition={spring}
                r={5}
                fill="#fff"
                stroke={color}
                strokeWidth={3}
              />
            </g>
          )}
        </svg>
      )}
      <AnimatePresence>
        {idx !== null && width > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{
              opacity: 1,
              y: 0,
              left: Math.min(Math.max(x(idx), 50), width - 50),
              top: Math.max(0, y(values[idx]) - 52),
            }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="pointer-events-none absolute -translate-x-1/2 rounded-xl px-2.5 py-1.5 text-center glass-strong"
          >
            <div className="text-[10.5px] font-medium text-white/50">{data[idx].year}</div>
            <div className="text-[13px] font-semibold tabular-nums text-white">
              {fmt(values[idx])} <span className="text-white/50">{unit}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
