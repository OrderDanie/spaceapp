import { useEffect, useRef } from "react";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useApp } from "@/store";

/** Routes connectivity changes through the Dynamic Island without adding UI clutter. */
export function NetworkMonitor() {
  const online = useConnectivity();
  const previous = useRef(online);

  useEffect(() => {
    if (!online) {
      useApp.getState().notify({
        title: "You’re offline",
        subtitle: "Loaded imagery stays available",
        icon: "alert",
        tone: "orange",
        // Transient: the idle island itself keeps showing "Offline" afterwards.
        duration: 3200,
      });
    } else if (!previous.current) {
      useApp.getState().notify({
        title: "Back online",
        subtitle: "NASA imagery is available again",
        icon: "check",
        tone: "green",
        duration: 2600,
      });
    }
    previous.current = online;
  }, [online]);

  return null;
}