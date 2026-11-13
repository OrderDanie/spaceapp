import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { useApp } from "@/store";
import { useOpenSound } from "@/hooks/useOpenSound";
import { api, ApiError } from "@/lib/api";
import type { GeoResult } from "@/data/places";
import { latestISO, addDays, snapshotUrl } from "@/lib/gibs";
import { SatImage } from "@/components/ui/SatImage";
import { Button, IconButton, SegmentedControl, Spinner } from "@/components/ui/primitives";

const TARGETS = [
  { value: "water", label: "Water" },
  { value: "forest", label: "Canopy" },
  { value: "vegetation", label: "Green" },
  { value: "snow", label: "Snow & ice" },
] as const;

/** Track any spot on Earth: search by name or type coordinates, frame it, save. */
export function AddPlaceSheet() {
  const draft = useApp((s) => s.addPlace);
  useOpenSound(!!draft);
  const close = () => useApp.getState().setAddPlace(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [span, setSpan] = useState(1.5);
  const [target, setTarget] = useState<(typeof TARGETS)[number]["value"]>("water");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const search = async (term: string) => {
    if (term.trim().length < 2) return;
    setSearching(true);
    setFormError(null);
    try {
      setResults(await api.searchPlaces(term.trim()));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!draft) return;
    setQuery(draft.name ?? "");
    setResults(null);
    setName(draft.lat != null ? draft.name ?? "" : "");
    setRegion(draft.region ?? "");
    setLat(draft.lat != null ? String(draft.lat) : "");
    setLon(draft.lon != null ? String(draft.lon) : "");
    setSpan(draft.span ?? 1.5);
    setTarget((TARGETS.find((t) => t.value === draft.target)?.value ?? "water"));
    setErrors({});
    setFormError(null);
    if (draft.name && draft.lat == null) void search(draft.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const pick = (r: GeoResult) => {
    setName(r.name);
    setRegion(r.region);
    setLat(String(r.lat));
    setLon(String(r.lon));
    setSpan(r.span);
    setTarget(r.ice ? "snow" : r.water ? "water" : "vegetation");
    setErrors({});
  };

  const nLat = Number(lat);
  const nLon = Number(lon);
  const located = lat !== "" && lon !== "" && Number.isFinite(nLat) && Number.isFinite(nLon) && Math.abs(nLat) <= 84 && Math.abs(nLon) <= 180;

  const save = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Give this place a name (2 characters or more).";
    if (lat === "" || !Number.isFinite(nLat) || Math.abs(nLat) > 84) e.lat = "Latitude must be between −84 and 84.";
    if (lon === "" || !Number.isFinite(nLon) || Math.abs(nLon) > 180) e.lon = "Longitude must be between −180 and 180.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setFormError(null);
    try {
      const place = await useApp.getState().createPlace({ name: name.trim(), region, lat: nLat, lon: nLon, span, target });
      const s = useApp.getState();
      s.notify({ title: "Now tracking", subtitle: `${place.name} · measuring its record`, icon: "pin", tone: "green", duration: 3600 });
      s.setAddPlace(null);
      s.selectPlace(place.id, "timelapse");
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setFormError(err instanceof Error ? err.message : "Couldn’t save this place.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {draft && (
        <motion.div className="absolute inset-0 z-[92] grid place-items-end sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Track a new place"
            data-epoch-modal
            initial={{ y: 40, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 30, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="scroll-area relative max-h-[92vh] w-full overflow-y-auto rounded-t-[30px] p-5 glass-strong sm:max-w-[520px] sm:rounded-[30px] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[21px] font-bold tracking-tight">Track a new place</h2>
                <p className="mt-0.5 text-[13px] text-white/50">Any lake, glacier, forest, delta or city. Epoch measures it back to 2001.</p>
              </div>
              <IconButton icon={X} label="Close" variant="solid" size="sm" onClick={close} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void search(query); }} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name, or “45.1, 59.7”" aria-label="Search for a place" className="field" style={{ paddingLeft: 40 }} />
              </div>
              <Button type="submit" variant="tinted" size="lg" disabled={searching || query.trim().length < 2} className="h-11">
                {searching ? <Spinner /> : "Search"}
              </Button>
            </form>

            {results && (
              <div className="mt-2 overflow-hidden rounded-[14px] bg-white/[0.05]">
                {results.length === 0 ? (
                  <p className="px-3.5 py-3 text-[13px] text-white/50">Nothing found for “{query}”. Try a fuller name, or enter coordinates below.</p>
                ) : (
                  results.map((r, i) => (
                    <button key={i} type="button" onClick={() => pick(r)} className="flex w-full items-center gap-3 border-b border-white/[0.05] px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-white/[0.06]">
                      <MapPin size={15} className="shrink-0 text-ios-teal" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{r.name}</span>
                        <span className="block truncate text-[11.5px] text-white/45">{r.kind} · {r.region}</span>
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-white/35">{r.lat.toFixed(2)}, {r.lon.toFixed(2)}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="mb-1 block text-[12px] font-semibold text-white/55">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-invalid={!!errors.name} placeholder="e.g. Lake Powell" className="field" />
                {errors.name && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{errors.name}</span>}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-white/55">Latitude</span>
                <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" aria-invalid={!!errors.lat} placeholder="37.04" className="field" />
                {errors.lat && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{errors.lat}</span>}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-white/55">Longitude</span>
                <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" aria-invalid={!!errors.lon} placeholder="-111.35" className="field" />
                {errors.lon && <span role="alert" className="mt-1 block text-[12px] text-[#ff8a80]">{errors.lon}</span>}
              </label>
            </div>

            <div className="mt-4">
              <span className="mb-1.5 block text-[12px] font-semibold text-white/55">What should Epoch measure?</span>
              <SegmentedControl value={target} onChange={setTarget} options={TARGETS.map((t) => ({ value: t.value, label: t.label }))} className="w-full [&>button]:flex-1" />
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[12px] font-semibold text-white/55">
                <span>Frame size</span>
                <span className="tabular-nums text-white/75">≈ {Math.round(span * 111)} km tall</span>
              </div>
              <input type="range" min={0.3} max={8} step={0.1} value={span} onChange={(e) => setSpan(Number(e.target.value))} className="ios-range" style={{ ["--p" as string]: `${((span - 0.3) / 7.7) * 100}%` }} aria-label="Frame size" />
            </div>

            {located ? (
              <SatImage
                key={`${nLat}|${nLon}|${span}`}
                src={snapshotUrl({ layer: "truecolor", date: addDays(latestISO(), -2), lat: nLat, lon: nLon, span, width: 640, height: 400 })}
                className="mt-3 aspect-[16/10] w-full rounded-[18px] ring-1 ring-white/[0.08]"
              />
            ) : (
              <div className="mt-3 grid aspect-[16/6] w-full place-items-center rounded-[18px] border border-dashed border-white/10 text-[12.5px] text-white/35">Pick a result or enter coordinates to preview the frame</div>
            )}

            {formError && <p role="alert" className="mt-3 rounded-[12px] bg-ios-red/15 px-3 py-2 text-[13px] text-[#ff8a80]">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="plain" onClick={close}>Cancel</Button>
              <Button variant="blue" disabled={saving} onClick={() => void save()}>
                {saving ? <Spinner /> : null} Track this place
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
