/*
 * Image warm-up: fills the browser's HTTP cache ahead of need, so the
 * <img> elements that render later resolve instantly.
 *
 * Rules: never compete with visible work (small concurrency, idle-time
 * kickoff), never repeat a URL, and stay off entirely when the user asked
 * to save data or is offline.
 */

const seen = new Set<string>();
const queue: string[] = [];
let inFlight = 0;
const MAX_PARALLEL = 4;

function allowed() {
  if (typeof navigator === "undefined") return false;
  if (!navigator.onLine) return false;
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|\b)(slow-2g|2g)\b/.test(conn.effectiveType)) return false;
  return true;
}

function pump() {
  while (inFlight < MAX_PARALLEL && queue.length) {
    const url = queue.shift()!;
    inFlight++;
    const img = new Image();
    const done = () => {
      inFlight--;
      pump();
    };
    img.onload = done;
    img.onerror = done;
    img.decoding = "async";
    // Lowest network priority — these must never delay visible images.
    (img as unknown as { fetchPriority?: string }).fetchPriority = "low";
    img.src = url;
  }
}

/** Queue URLs for background warm-up (deduplicated, throttled). */
export function prefetchImages(urls: Array<string | null | undefined>) {
  if (!allowed()) return;
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    queue.push(url);
  }
  pump();
}

/** Same, but waits for an idle moment first (startup warm-up). */
export function prefetchWhenIdle(urls: Array<string | null | undefined>, timeout = 2500) {
  if (typeof window === "undefined") return;
  const kick = () => prefetchImages(urls);
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(kick, { timeout });
  else window.setTimeout(kick, 600);
}
