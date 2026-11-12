import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const snapshot = () => navigator.onLine;

/** Browser connectivity exposed as a tiny external store. */
export function useConnectivity() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}