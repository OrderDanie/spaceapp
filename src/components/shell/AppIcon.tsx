import { motion } from "framer-motion";
import { safeId } from "@/components/ui/primitives";
import { useId } from "react";

/** Squircle app icon: a small planet with an orbiting satellite. */
export function AppIcon({ size = 36, animated = false }: { size?: number; animated?: boolean }) {
  const id = safeId(useId());
  const orbit = "M 9 41 A 24 9 -24 1 0 55 23 A 24 9 -24 1 0 9 41";
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2237,
        background: "linear-gradient(160deg, #0b1a4a 0%, #0a5bd8 52%, #4fc3ff 100%)",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -${size * 0.06}px ${size * 0.14}px rgba(0,0,0,0.25), 0 ${size * 0.18}px ${size * 0.4}px -${size * 0.14}px rgba(10,132,255,0.75)`,
      }}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={`pl${id}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#bff0ff" />
            <stop offset="35%" stopColor="#3fb3ff" />
            <stop offset="75%" stopColor="#0b4fb3" />
            <stop offset="100%" stopColor="#06235a" />
          </radialGradient>
          <clipPath id={`front${id}`}>
            <rect x="0" y="33" width="64" height="40" transform="rotate(-24 32 32)" />
          </clipPath>
        </defs>
        {/* back of the orbit */}
        <motion.path
          d={orbit}
          fill="none"
          stroke="white"
          strokeOpacity={0.35}
          strokeWidth={1.6}
          initial={animated ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.3, ease: [0.32, 0.72, 0, 1] }}
        />
        <circle cx="32" cy="32" r="15" fill={`url(#pl${id})`} />
        <path d="M 22 27 q 6 -4 9 1 t 8 2" stroke="#9ff5c7" strokeOpacity="0.7" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 25 39 q 5 2 9 -1" stroke="#9ff5c7" strokeOpacity="0.55" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* front of the orbit */}
        <motion.path
          d={orbit}
          fill="none"
          stroke="white"
          strokeWidth={2.2}
          clipPath={`url(#front${id})`}
          initial={animated ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.3, ease: [0.32, 0.72, 0, 1] }}
        />
        {animated ? (
          <circle r="3.4" fill="#fff" style={{ filter: "drop-shadow(0 0 3px #fff)" }}>
            <animateMotion dur="3.2s" repeatCount="indefinite" path={orbit} />
          </circle>
        ) : (
          <circle cx="53.5" cy="24" r="3.4" fill="#fff" />
        )}
      </svg>
    </div>
  );
}
