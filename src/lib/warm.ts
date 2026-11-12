import { prefetchImages, prefetchWhenIdle } from "@/lib/imageCache";
import { compareSnapshotSize, snapshotUrl } from "@/lib/gibs";
import type { Place } from "@/data/places";

/** The two full-size images the Compare view will request for this place. */
export function compareUrls(p: Place, hd: boolean) {
  const [width, height] = compareSnapshotSize(hd);
  const common = { layer: p.layer, lat: p.lat, lon: p.lon, span: p.span, width, height };
  return [snapshotUrl({ ...common, date: p.before }), snapshotUrl({ ...common, date: p.after })];
}

/** Warm Compare imagery for a place right now (hover intent). */
export function warmCompare(p: Place, hd: boolean) {
  prefetchImages(compareUrls(p, hd));
}

/** Warm Compare imagery once the browser is idle (likely next action). */
export function warmCompareWhenIdle(p: Place, hd: boolean) {
  prefetchWhenIdle(compareUrls(p, hd));
}
