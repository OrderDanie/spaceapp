import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const COUNT = 10;

/**
 * Celebratory particle burst. Renders nothing until `trigger` changes, then
 * sprays a ring of dots outward. Purely decorative and layout-neutral.
 */
export function Burst({ trigger, color = "#30d158", radius = 30 }: { trigger: number; color?: string; radius?: number }) {
  const [shot, setShot] = useState<number | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setShot(trigger);
    const t = window.setTimeout(() => setShot(null), 750);
    return () => window.clearTimeout(t);
  }, [trigger]);

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-visible">
      <AnimatePresence>
        {shot !== null && (
          <motion.span key={shot} className="absolute h-0 w-0" exit={{ opacity: 0 }}>
            <motion.span
              className="absolute -left-4 -top-4 h-8 w-8 rounded-full"
              style={{ border: `2px solid ${color}` }}
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
            />
            {Array.from({ length: COUNT }, (_, i) => {
              const a = (i / COUNT) * Math.PI * 2 + (shot % 7) * 0.3;
              const r = radius * (i % 2 ? 0.75 : 1);
              return (
                <motion.span
                  key={i}
                  className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full"
                  style={{ background: i % 3 === 0 ? "#fff" : color }}
                  initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
                  animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, scale: [0.4, 1.1, 0], opacity: [1, 1, 0] }}
                  transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
