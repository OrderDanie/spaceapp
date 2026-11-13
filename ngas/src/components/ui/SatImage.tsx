import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { CloudOff, RotateCcw, Satellite } from "lucide-react";
import { cn } from "@/utils/cn";

/** Satellite image with shimmer skeleton, blur-up reveal and retry. */
export function SatImage({
  src,
  alt = "",
  className,
  imgClassName,
  lazy = false,
  onLoad,
  showIcon = true,
  priority = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  lazy?: boolean;
  onLoad?: () => void;
  showIcon?: boolean;
  /** Marks the image as the page's main content — fetched ahead of the rest. */
  priority?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const url = attempt ? `${src}&_r=${attempt}` : src;
  // Derived per-URL state — immune to cached images firing onLoad early.
  const state: "loading" | "loaded" | "error" = errorUrl === url ? "error" : loadedUrl === url ? "loaded" : "loading";

  return (
    <div className={cn("relative overflow-hidden bg-[#0b0f16]", className)}>
      <AnimatePresence>
        {state === "loading" && (
          <motion.div key="sk" className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_20%,rgba(100,160,255,0.08),transparent_60%)]" />
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            {showIcon && (
              <div className="absolute inset-0 grid place-items-center">
                <Satellite className="animate-float text-white/15" size={26} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {state !== "error" && (
        <motion.img
          key={url}
          src={url}
          alt={alt}
          draggable={false}
          decoding="async"
          loading={priority ? "eager" : lazy ? "lazy" : "eager"}
          fetchPriority={priority ? "high" : lazy ? "low" : "auto"}
          onLoad={() => {
            setLoadedUrl(url);
            onLoad?.();
          }}
          onError={() => setErrorUrl(url)}
          initial={{ opacity: 0, scale: 1.05, filter: "blur(14px)" }}
          animate={state === "loaded" ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0 }}
          transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
          className={cn("absolute inset-0 h-full w-full object-cover", imgClassName)}
        />
      )}

      {state === "error" && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <CloudOff size={22} className="text-white/35" />
            <p className="text-[12px] font-medium text-white/45">Imagery unavailable</p>
            {/* Not a <button>: SatImage often lives inside clickable cards. */}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setAttempt((a) => a + 1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setAttempt((a) => a + 1);
                }
              }}
              className="group mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold text-white/80 transition-[background,transform] hover:bg-white/15 active:scale-95"
            >
              <RotateCcw size={12} className="transition-transform duration-500 ease-apple group-hover:-rotate-180" /> Retry
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
