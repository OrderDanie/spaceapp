import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Columns2, ExternalLink, MapPin, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useApp } from "@/store";
import { api, type ChatAction, type ChatCard, type ChatMessage } from "@/lib/api";
import type { EarthEvent } from "@/data/places";
import { CLASSES, SURFACE_KEYS, fmtDay, fmtKm2, fmtPct, metricValue, targetOf, type Measurement, type TrendPoint } from "@/lib/spectral";
import { snapshotUrl } from "@/lib/gibs";
import { SatImage } from "@/components/ui/SatImage";
import { Sparkline } from "@/components/ui/charts";
import { IconButton, Spinner } from "@/components/ui/primitives";
import { sfx } from "@/lib/sound";
import { useOpenSound } from "@/hooks/useOpenSound";
import { haptic } from "@/lib/haptics";
import { cn } from "@/utils/cn";

const STARTERS = ["What changed at the Aral Sea since 2000?", "Compare Lake Chad 2001 vs today", "Any wildfires right now?", "Which place changed the most?", "Show the trend for Lake Urmia", "How do you measure?"];

interface PlaceBrief {
  id: string | null;
  name: string;
  region: string;
  lat: number;
  lon: number;
  span: number;
  target: string;
}

/** **bold** and bullet lines — the only formatting the analyst emits. */
function Rich({ text }: { text: string }) {
  const inline = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong> : part));
  return (
    <>
      {text.split("\n").map((line, i) =>
        line.startsWith("• ") ? (
          <div key={i} className="flex gap-2 pl-0.5">
            <span className="text-white/35">•</span>
            <span>{inline(line.slice(2))}</span>
          </div>
        ) : line.trim() === "" ? (
          <div key={i} className="h-2" />
        ) : (
          <p key={i}>{inline(line)}</p>
        )
      )}
    </>
  );
}

function runAction(a: ChatAction) {
  const s = useApp.getState();
  switch (a.type) {
    case "navigate":
      if (a.placeId) s.selectPlace(String(a.placeId), a.view as never);
      else if (a.view) s.setView(a.view as never);
      if (a.date) s.setExploreDate(String(a.date));
      break;
    case "compare":
      s.openCompare(String(a.placeId), String(a.a), String(a.b));
      break;
    case "flyTo":
      s.setView("explore");
      s.setPin({ lat: Number(a.lat), lon: Number(a.lon), name: String(a.name ?? ""), span: Number(a.span) || 1.5 });
      if (a.date) s.setExploreDate(String(a.date));
      break;
    case "layer":
      s.setLayer(a.id as never);
      break;
    case "watch":
      s.setWatch(String(a.placeId), !!a.on);
      break;
    case "track":
      void s
        .createPlace(a.place as never)
        .then((p) => s.notify({ title: "Now tracking", subtitle: p.name, icon: "pin", tone: "green" }))
        .catch((e: Error) => s.notify({ title: "Couldn’t add that place", subtitle: e.message, icon: "alert", tone: "red", duration: 4000 }));
      break;
  }
}

const cardBox = "mt-2 overflow-hidden rounded-[18px] bg-black/25 ring-1 ring-inset ring-white/[0.07]";
const chip = "inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.09] px-3 text-[12px] font-semibold text-white/85 transition-colors hover:bg-white/[0.15]";

function thumb(p: PlaceBrief, date: string) {
  return snapshotUrl({ layer: "truecolor", date, lat: p.lat, lon: p.lon, span: p.span, width: 320, height: 200 });
}

function Card({ card }: { card: ChatCard }) {
  const s = useApp.getState();
  if (card.type === "change") {
    const p = card.place as PlaceBrief;
    const a = card.a as Measurement;
    const b = card.b as Measurement;
    const target = String(card.target);
    const t = targetOf(target);
    const va = metricValue(a, target) ?? 0;
    const vb = metricValue(b, target) ?? 0;
    const max = Math.max(va, vb, 1);
    return (
      <div className={cardBox}>
        <div className="grid grid-cols-2 gap-px">
          {[a, b].map((m) => (
            <div key={m.date} className="relative">
              <SatImage lazy showIcon={false} src={thumb(p, m.date)} className="aspect-[16/10] w-full" />
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold backdrop-blur">{fmtDay(m.date)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold text-white/55">{t.label}</span>
            <span className="text-[17px] font-bold tabular-nums" style={{ color: (card.delta as number) == null ? "#fff" : (card.delta as number) >= 0 === t.goodWhenUp ? "#30d158" : "#ff6961" }}>
              {fmtPct(card.delta as number | null)}
            </span>
          </div>
          {[[a, va], [b, vb]].map(([m, v]) => (
            <div key={(m as Measurement).date}>
              <div className="mb-0.5 flex justify-between text-[11px] tabular-nums text-white/55">
                <span>{(m as Measurement).date.slice(0, 4)}</span>
                <span className="text-white/85">{fmtKm2(v as number)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div className="h-full rounded-full" style={{ background: t.color }} initial={{ width: 0 }} animate={{ width: `${((v as number) / max) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {p.id ? (
              <button className={chip} onClick={() => { s.openCompare(p.id!, a.date, b.date); if (window.innerWidth < 1024) s.setAnalyst(false); }}>
                <Columns2 size={13} /> Open in Compare
              </button>
            ) : (
              <button className={chip} onClick={() => runAction({ type: "track", place: { name: p.name, region: p.region, lat: p.lat, lon: p.lon, span: p.span, target } })}>
                <Plus size={13} /> Track {p.name}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (card.type === "series") {
    const pts = card.points as TrendPoint[];
    const t = targetOf(String(card.target));
    return (
      <div className={cn(cardBox, "p-3")}>
        <div className="flex items-center justify-between text-[11.5px] text-white/50">
          <span className="font-semibold">{t.label} · km²</span>
          <span className="tabular-nums">{pts[0].year}–{pts[pts.length - 1].year}</span>
        </div>
        <Sparkline values={pts.map((p) => p.value)} color={t.color} width={300} height={70} className="mt-2 w-full" />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/60">
          <span>{fmtKm2(pts[0].value)}</span>
          <span>{fmtKm2(pts[pts.length - 1].value)}</span>
        </div>
      </div>
    );
  }
  if (card.type === "measure") {
    const m = card.m as Measurement;
    const rows = SURFACE_KEYS.map((k) => ({ c: CLASSES.find((x) => x.key === k)!, v: (m as unknown as Record<string, number>)[`${k}_km2`] || 0 })).filter((r) => r.v > 0).sort((x, y) => y.v - x.v);
    const total = m.clear_km2 || 1;
    return (
      <div className={cn(cardBox, "space-y-1.5 p-3")}>
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {rows.map((r) => (
            <span key={r.c.key} style={{ width: `${(r.v / total) * 100}%`, background: `rgb(${r.c.color.join(",")})` }} />
          ))}
        </div>
        {rows.slice(0, 5).map((r) => (
          <div key={r.c.key} className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 text-white/70">
              <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${r.c.color.join(",")})` }} /> {r.c.label}
            </span>
            <span className="tabular-nums text-white/85">{fmtKm2(r.v)}</span>
          </div>
        ))}
        <div className="pt-1 text-[11px] text-white/35">Cloud {m.cloud_pct}% · {fmtDay(m.used_date)} · MODIS bands 7-2-1</div>
      </div>
    );
  }
  if (card.type === "events") {
    const items = card.items as EarthEvent[];
    return (
      <div className={cn(cardBox, "divide-y divide-white/[0.06]")}>
        {items.map((e) => (
          <button
            key={e.id}
            onClick={() => { runAction({ type: "flyTo", lat: e.lat, lon: e.lon, name: e.title, span: 3, date: e.date }); if (window.innerWidth < 1024) s.setAnalyst(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
          >
            <MapPin size={14} className="shrink-0 text-ios-orange" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{e.title}</span>
              <span className="block truncate text-[11px] text-white/45">
                {e.categoryLabel} · {fmtDay(e.date)}
                {e.distance != null ? ` · ${e.distance.toLocaleString("en-US")} km away` : ""}
              </span>
            </span>
            {e.link && (
              <a href={e.link} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} aria-label="Source" className="grid h-7 w-7 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white">
                <ExternalLink size={12} />
              </a>
            )}
          </button>
        ))}
      </div>
    );
  }
  if (card.type === "ranking") {
    const items = card.items as { id: string; name: string; target: string; pct: number; from: TrendPoint; to: TrendPoint }[];
    return (
      <div className={cn(cardBox, "divide-y divide-white/[0.06]")}>
        {items.map((r, i) => (
          <button key={r.id} onClick={() => { s.openCompare(r.id, r.from.date, r.to.date); if (window.innerWidth < 1024) s.setAnalyst(false); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]">
            <span className="w-4 text-[11px] font-semibold tabular-nums text-white/35">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{r.name}</span>
              <span className="block text-[11px] text-white/45">{targetOf(r.target).label} · {r.from.year}–{r.to.year}</span>
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: r.pct >= 0 === targetOf(r.target).goodWhenUp ? "#30d158" : "#ff6961" }}>{fmtPct(r.pct)}</span>
          </button>
        ))}
      </div>
    );
  }
  return null;
}

export function AnalystPanel() {
  const open = useApp((s) => s.analystOpen);
  const seed = useApp((s) => s.analystSeed);
  const setAnalyst = useApp((s) => s.setAnalyst);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seeded = useRef(0);
  const sheet = useDragControls();
  useOpenSound(open);

  const load = useCallback(() => {
    setStatus("loading");
    api.chatHistory().then((m) => { setMessages(m); setStatus("ready"); }).catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (open && status === "idle") load();
    if (open) {
      const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 350);
      return () => window.clearTimeout(t);
    }
  }, [open, status, load]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open, status]);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || pending) return;
      setText("");
      setError(null);
      setPending(q);
      sfx.send();
      const s = useApp.getState();
      try {
        const fresh = await api.chatSend(q, { view: s.view, placeId: s.placeId, focusPlace: s.focusPlace, exploreDate: s.exploreDate, layer: s.layer });
        setMessages((m) => [...m, ...fresh]);
        sfx.receive();
        haptic("success");
        const wide = window.innerWidth >= 1024;
        const actions = fresh.find((m) => m.role === "assistant")?.payload?.actions ?? [];
        let moved = false;
        for (const a of actions) {
          if (a.soft && !wide) continue;
          runAction(a);
          if (["navigate", "compare", "flyTo"].includes(a.type)) moved = true;
        }
        if (moved && !wide) window.setTimeout(() => useApp.getState().setAnalyst(false), 900);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setText(q);
        sfx.alert();
      } finally {
        setPending(null);
      }
    },
    [pending]
  );

  // A question handed over from Spotlight or a button is asked once the panel is ready.
  useEffect(() => {
    if (open && seed && seed.nonce !== seeded.current && status === "ready" && !pending) {
      seeded.current = seed.nonce;
      void send(seed.text);
    }
  }, [open, seed, status, pending, send]);

  const lastId = messages[messages.length - 1]?.id;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label="Epoch analyst"
          data-epoch-modal
          initial={{ opacity: 0, x: 48, scale: 0.96, filter: "blur(10px)" }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          exit={{ opacity: 0, x: 40, scale: 0.97, filter: "blur(8px)", transition: { duration: 0.22 } }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          // On a phone the panel is a sheet: pull it down by its header to dismiss.
          drag="y"
          dragControls={sheet}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.7 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 130 || info.velocity.y > 700) setAnalyst(false);
          }}
          className="absolute inset-x-2 bottom-2 top-[60px] z-[88] flex flex-col overflow-hidden rounded-[28px] glass-strong sm:inset-x-auto sm:right-4 sm:top-[68px] sm:bottom-4 sm:w-[420px]"
        >
          <header
            onPointerDown={(e) => {
              if (window.innerWidth < 640 && !(e.target as Element).closest("button")) sheet.start(e);
            }}
            className="relative flex touch-none items-center gap-3 border-b border-white/[0.07] px-4 py-3 sm:touch-auto"
          >
            <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-white/20 sm:hidden" />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: "linear-gradient(180deg,#3d9bff,#0a6fe0)" }}>
              <Sparkles size={17} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Ask Epoch</div>
              <div className="truncate text-[11.5px] text-white/45">Measures NASA imagery · not a general chatbot</div>
            </div>
            {messages.length > 0 && (
              <IconButton
                icon={Trash2}
                label="Clear conversation"
                variant="plain"
                size="sm"
                onClick={() => { void api.chatClear().then(() => setMessages([])).catch(() => setError("Couldn’t clear the conversation.")); }}
              />
            )}
            <IconButton icon={X} label="Close" variant="solid" size="sm" onClick={() => setAnalyst(false)} />
          </header>

          <div ref={scroller} className="scroll-area min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {status === "loading" && (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-white/45"><Spinner /> Loading your conversation…</div>
            )}
            {status === "error" && (
              <div className="py-10 text-center text-[13px] text-white/55">
                Couldn’t load your conversation.
                <button onClick={load} className="ml-2 font-semibold text-[#4aa3ff]">Retry</button>
              </div>
            )}
            {status === "ready" && messages.length === 0 && !pending && (
              <div className="pt-2">
                <p className="text-[14px] leading-relaxed text-white/65">
                  I download NASA satellite imagery, label every pixel (water, canopy, bare ground, snow, burn scars) and measure what changed. Ask about any place on Earth, any dates since 2000.
                </p>
                <div className="mt-4 flex flex-col gap-1.5">
                  {STARTERS.map((q) => (
                    <button key={q} onClick={() => void send(q)} className="rounded-[14px] bg-white/[0.06] px-3.5 py-2.5 text-left text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.1]">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <motion.div key={m.id} initial={{ opacity: 0, y: 14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 28 }} style={{ transformOrigin: "100% 100%" }} className="ml-10 flex justify-end">
                  <div className="rounded-[18px] rounded-br-[6px] bg-ios-blue px-3.5 py-2 text-[14px] leading-snug">{m.content}</div>
                </motion.div>
              ) : (
                <motion.div key={m.id} initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 340, damping: 28 }} style={{ transformOrigin: "0% 100%" }} className="mr-6">
                  <div className="space-y-1 rounded-[18px] rounded-bl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white/80">
                    <Rich text={m.content} />
                  </div>
                  {m.payload?.cards?.map((c, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 + i * 0.08 }}>
                      <Card card={c} />
                    </motion.div>
                  ))}
                  {m.id === lastId && !!m.payload?.suggestions?.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.payload.suggestions.map((q) => (
                        <button key={q} onClick={() => void send(q)} className={chip}>{q}</button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            )}
            {pending && (
              <>
                <div className="ml-10 flex justify-end">
                  <div className="rounded-[18px] rounded-br-[6px] bg-ios-blue/70 px-3.5 py-2 text-[14px] leading-snug">{pending}</div>
                </div>
                <div className="mr-6 inline-flex items-center gap-2.5 rounded-[18px] rounded-bl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-[12.5px] text-white/55">
                  <span className="typing-dots flex gap-1 text-white/70"><span /><span /><span /></span>
                  Fetching imagery and counting pixels…
                </div>
              </>
            )}
            {error && <div role="alert" className="rounded-[14px] bg-ios-red/15 px-3.5 py-2.5 text-[13px] text-[#ff8a80]">{error} Your question is back in the box — send it again.</div>}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); void send(text); }}
            className="flex items-center gap-2 border-t border-white/[0.07] p-3"
          >
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={400}
              placeholder="Ask about a place, a date, an event…"
              aria-label="Your question"
              className="field h-11 flex-1 rounded-full"
            />
            <button
              type="submit"
              disabled={!text.trim() || !!pending}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ios-blue text-white transition-opacity"
            >
              {pending ? <Spinner /> : <ArrowUp size={19} strokeWidth={2.6} />}
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
