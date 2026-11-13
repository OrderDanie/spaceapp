import { useEffect, useRef } from "react";
import { sfx } from "@/lib/sound";

/** A soft breath of air when a surface opens, and a softer one when it closes. */
export function useOpenSound(open: boolean) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!open) return;
    }
    if (open) sfx.whoosh();
    else sfx.settle();
  }, [open]);
}
