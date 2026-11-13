import { motion } from "framer-motion";
import { useEffect } from "react";
import { appleEase } from "@/components/ui/primitives";
import { sfx } from "@/lib/sound";
import { AppIcon } from "./AppIcon";
import { APP_ICON_MORPH_ID, morphLayout } from "@/hooks/useMorphTargets";

const DURATION = 1100;

/**
 * The launch moment. Everything is already loaded by the time this shows, so
 * there is no progress bar to fake: the mark holds for a beat in exactly the
 * place the loader left it, then flies into the app's brand corner.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    sfx.intro(); // queues itself if audio is still locked
    const t = window.setTimeout(onDone, DURATION);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="starfield absolute inset-0 z-[200] grid place-items-center bg-black p-6"
      exit={{ opacity: 0, scale: 1.05, filter: "blur(12px)" }}
      transition={{ duration: 0.6, ease: appleEase }}
      onClick={onDone}
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <motion.div layoutId={APP_ICON_MORPH_ID} transition={morphLayout} style={{ borderRadius: 19 }}>
          <AppIcon size={84} animated />
        </motion.div>
        <h1 className="mt-6 text-[28px] font-bold tracking-tight">Epoch</h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: appleEase }}
          className="mt-3 text-[13.5px] text-white/55"
        >
          Earth, over time
        </motion.p>
      </div>
    </motion.div>
  );
}
