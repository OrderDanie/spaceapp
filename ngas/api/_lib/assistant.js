/*
 * Epoch's analyst. Deliberately not a language model: it parses the question
 * with rules, runs real measurements (NASA imagery → spectral classification)
 * and NASA EONET lookups, and writes its answer from those numbers only.
 * If it cannot ground an answer, it says so.
 */
import * as S from './spectral.js';
import { addDays, latestISO } from './http.js';
import { measure, compareDays, cachedSeries, seriesDates } from './measure.js';
import { geocode } from './geo.js';
import { fetchEvents, EVENT_CATEGORIES } from './eonet.js';
import { validPoints } from './alerts.js';
import supabase from '../db-client.js';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const EXTRA_ALIASES = {
  aral: ['aral'],
  mead: ['mead', 'hoover dam'],
  rondonia: ['rondonia', 'amazon'],
  sindh: ['indus', 'sindh', 'pakistan flood', 'pakistan floods'],
  nsw: ['black summer', 'new south wales', 'nsw'],
  urmia: ['urmia', 'orumiyeh'],
  marshes: ['marshes', 'mesopotamia', 'mesopotamian'],
  saltlake: ['salt lake'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NUM_WORDS = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20 };
const pad = (n) => String(n).padStart(2, '0');
const wordRe = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);

/* --------------------------------- places --------------------------------- */
function findTracked(text, places) {
  let best = null;
  for (const p of places) {
    const aliases = [norm(p.name), ...(EXTRA_ALIASES[p.id] || [])];
    const bare = norm(p.name).replace(/^(lake|great|the) /, '');
    if (bare.length >= 4) aliases.push(bare);
    for (const a of aliases) {
      if (a.length < 3) continue;
      if (wordRe(a).test(text) && (!best || a.length > best.alias.length)) best = { place: p, alias: a };
    }
  }
  return best;
}

const STOP_AFTER =
  '(?: since| from| between| in (?:19|20)\\d{2}| on | during| vs\\.?| versus| compared| and (?:19|20)\\d{2}| over the| over time| today| now| right now| last | this year| (?:19|20)\\d{2}| (?:\\d+|a|one|two|three|five|ten|twenty) (?:years?|decades?) ago| changed| look| in true| in snow| in land| in false| with | using |[?.!,;]|$)';

/** Pull a free-text location out of the question ("…at Lake Chad since 2005"). */
function locationPhrase(text) {
  const patterns = [
    new RegExp(`(?:take me to|fly to|go to|zoom to|zoom in on|navigate to|show me|show|find|locate|where is|track|watch|follow|add|open|view|look at|measure|analy[sz]e|compare|timelapse of|timelapse for|trend for|trend of|history of)\\s+(?:the )?(.+?)${STOP_AFTER}`),
    new RegExp(`(?: at| in| of| for| near| over| around| about| to| on)\\s+(?:the )?(.+?)${STOP_AFTER}`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let phrase = m[1].trim();
    phrase = phrase.replace(/^(?:the |my |a |an )/, '').replace(/\b(?:area|region|place|location|imagery|image|map|globe|water|forest|ice|snow|level|levels|extent|surface|timelapse|trend|compare|comparison)\b$/g, '').trim();
    if (phrase.length < 3 || phrase.length > 48) continue;
    if (/^(?:it|this|that|here|there|me|us|earth|world|globe|map|year|years|time|what|how|much|many|change|changes|changed|last|decade|past|compare|alerts?|places?|today|explore|settings|true colou?r|false colou?r|snow|ice|land|water|forest|vegetation|green|burn|fire)\b/.test(phrase)) continue;
    if (/^\d+$/.test(phrase)) continue;
    return phrase;
  }
  return null;
}

/* ---------------------------------- dates ---------------------------------- */
function parseDates(text, latest) {
  const found = [];
  let rest = text;
  const take = (re, fn) => {
    rest = rest.replace(re, (...m) => {
      const idx = m[m.length - 2];
      const v = fn(...m);
      if (v) found.push({ idx, ...v });
      return ' '.repeat(m[0].length);
    });
  };
  const year = Number(latest.slice(0, 4));
  take(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => ({ iso: `${y}-${mo}-${d}`, exact: true }));
  take(new RegExp(`\\b${MONTH_RE}\\.? (\\d{1,2})(?:st|nd|rd|th)?,? ((?:19|20)\\d{2})\\b`, 'g'), (m, mo, d, y) => ({ iso: `${y}-${pad(MONTHS.indexOf(mo.slice(0, 3)) + 1)}-${pad(d)}`, exact: true }));
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH_RE}\\.?,? ((?:19|20)\\d{2})\\b`, 'g'), (m, d, mo, y) => ({ iso: `${y}-${pad(MONTHS.indexOf(mo.slice(0, 3)) + 1)}-${pad(d)}`, exact: true }));
  take(new RegExp(`\\b${MONTH_RE}\\.?,? (?:of )?((?:19|20)\\d{2})\\b`, 'g'), (m, mo, y) => ({ iso: `${y}-${pad(MONTHS.indexOf(mo.slice(0, 3)) + 1)}-15`, exact: false, month: true }));
  take(/\b(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) (year|decade)s? ago\b/g, (m, n, unit) => ({ year: year - (NUM_WORDS[n] ?? Number(n)) * (unit === 'decade' ? 10 : 1) }));
  take(/\b(?:the )?(?:last|past) (\d+|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty) (year|decade)s?\b/g, (m, n, unit) => ({ year: year - (NUM_WORDS[n] ?? Number(n)) * (unit === 'decade' ? 10 : 1), span: true }));
  take(/\b(?:the )?(?:last|past) decade\b/g, () => ({ year: year - 10, span: true }));
  take(/\blast year\b/g, () => ({ year: year - 1 }));
  take(/\blast month\b/g, () => ({ iso: addDays(latest, -30), exact: true }));
  take(/\blast week\b/g, () => ({ iso: addDays(latest, -7), exact: true }));
  take(/\byesterday\b/g, () => ({ iso: latest, exact: true, latest: true }));
  take(/\b((?:19|20)\d{2})\b/g, (m, y) => ({ year: Number(y) }));
  take(/\b(today|now|right now|currently|current|latest|present|this year|most recent|newest)\b/g, () => ({ latest: true }));
  found.sort((a, b) => a.idx - b.idx);
  return found;
}

const clampDay = (iso, latest) => (iso < S.ANALYSIS_MIN_DATE ? S.ANALYSIS_MIN_DATE : iso > latest ? latest : iso);

/** Year-only mentions resolve to the place's own sampling day, so seasons match. */
function resolveDates(tokens, geo, latest) {
  const md = geo.month_day || (geo.lat >= 0 ? '08-15' : '02-15');
  const lastSeasonal = () => {
    const y = Number(latest.slice(0, 4));
    return `${y}-${md}` <= latest ? `${y}-${md}` : `${y - 1}-${md}`;
  };
  const anyYearOnly = tokens.some((t) => t.year);
  return tokens.map((t) => {
    if (t.iso) return { iso: clampDay(t.iso, latest), exact: !!t.exact, clamped: t.iso !== clampDay(t.iso, latest) };
    if (t.year) {
      let iso = `${t.year}-${md}`;
      const c = clampDay(iso, latest);
      return { iso: iso > latest ? lastSeasonal() : c, exact: false, clamped: iso !== c };
    }
    // "today" next to a bare year means "this season", not literally today.
    return anyYearOnly ? { iso: lastSeasonal(), exact: false } : { iso: latest, exact: true, latest: true };
  });
}

/* --------------------------------- intents --------------------------------- */
const has = (text, re) => re.test(text);
const VIEW_WORDS = [
  ['compare', /\bcompar(e|ison)\b|\bbefore and after\b|\bside by side\b/],
  ['timelapse', /\btime ?-?lapse\b|\banimat(e|ion)\b/],
  ['alerts', /\balerts?\b|\bnotifications?\b/],
  ['places', /\b(my )?places\b|\blibrary\b|\bwatchlist\b/],
  ['today', /\btoday view\b|\bhome\b|\bdashboard\b|\bbriefing\b/],
  ['explore', /\bglobe\b|\bexplore\b|\bmap\b/],
];
const LAYER_WORDS = [
  ['snowice', /\bsnow\b.*\b(layer|view|bands?|false)\b|\b3-?6-?7\b|\bsnow ?(&|and) ?ice\b/],
  ['landwater', /\b7-?2-?1\b|\bland ?(&|and) ?water\b|\bfalse colou?r\b|\binfrared\b/],
  ['viirs', /\bviirs\b|\bnoaa-?20\b/],
  ['truecolor', /\btrue colou?r\b|\bnatural colou?r\b|\bmodis true\b/],
];
const EVENT_WORDS = [
  ['wildfires', /\b(wild)?fires?\b|\bbushfires?\b|\bburning\b/],
  ['severeStorms', /\bstorms?\b|\bcyclones?\b|\bhurricanes?\b|\btyphoons?\b/],
  ['volcanoes', /\bvolcano(es)?\b|\beruptions?\b|\berupting\b/],
  ['seaLakeIce', /\bicebergs?\b|\bsea ice\b/],
  ['floods', /\bfloods?\b|\bflooding\b/],
  ['dustHaze', /\bdust\b|\bhaze\b|\bsandstorms?\b/],
  ['earthquakes', /\bearthquakes?\b|\bquakes?\b/],
  ['landslides', /\blandslides?\b/],
];
const TARGET_WORDS = [
  ['forest', /\bforests?\b|\bcanopy\b|\btrees?\b|\bdeforest/],
  ['vegetation', /\bvegetation\b|\bgreen(ery|ness)?\b|\bcrops?\b|\bndvi\b|\bfarm/],
  ['snow', /\bsnow\b|\bice\b|\bglaciers?\b/],
  ['burn', /\bburn(ed|t)?\b|\bfire scar/],
  ['water', /\bwater\b|\blake\b|\bsea\b|\breservoir\b|\bshorelines?\b|\bflood/],
];

const KNOWLEDGE = [
  [/\b(7-?2-?1|bands?|false colou?r|land ?(&|and) ?water)\b/, () =>
    '**Bands 7-2-1** is a false-colour view from MODIS. Instead of red, green and blue light it shows short-wave infrared (band 7), near infrared (band 2) and visible red (band 1). Water absorbs infrared, so it turns black or deep blue. Healthy plants reflect near infrared strongly, so they glow green. Bare soil looks tan, fresh burn scars red-brown, and snow or ice bright turquoise. That contrast is why I use this view for every measurement.'],
  [/\bndvi\b/, () =>
    '**NDVI** (Normalized Difference Vegetation Index) is (NIR − Red) ÷ (NIR + Red). Leaves absorb red light and reflect near infrared, so dense vegetation scores high (towards 1) and bare ground or water scores near zero or below. I compute it per pixel from MODIS bands 2 and 1.'],
  [/\bnbr\b|\bburn ratio\b/, () =>
    '**NBR** (Normalized Burn Ratio) is (NIR − SWIR) ÷ (NIR + SWIR). Burned ground reflects less near infrared and more short-wave infrared than living vegetation, so NBR drops sharply after a fire. I flag a pixel as a burn scar when NBR is clearly negative and the surface is dark in near infrared.'],
  [/\b(modis|terra)\b/, () =>
    '**MODIS on Terra** has imaged almost the whole planet every day since 24 February 2000. Its sharpest bands resolve 250 m, the short-wave infrared band I rely on resolves 500 m. Terra crosses the equator mid-morning local time. All of Epoch’s yearly trends are measured from Terra MODIS so the record is consistent from 2000 to today.'],
  [/\bviirs\b|\bnoaa-?20\b/, () =>
    '**VIIRS on NOAA-20** is the newer daily imager (launched November 2017), with 375 m imagery and a wider swath, so its mosaics have no gaps at the equator. Epoch uses it for the globe’s default true-colour view of recent days.'],
  [/\bgibs\b|\bwhere .*(imagery|images|data).* from\b|\bdata source\b/, () =>
    'All imagery is streamed from **NASA GIBS** (Global Imagery Browse Services), a public archive of daily satellite mosaics. Natural-event listings come from **NASA EONET**. Place-name search uses OpenStreetMap data. Nothing here is simulated.'],
  [/\beonet\b/, () =>
    '**EONET** is NASA’s Earth Observatory Natural Event Tracker: a curated, continuously updated list of wildfires, storms, volcanic eruptions, icebergs and more, each with coordinates and dates. Ask me “any wildfires right now?” and I’ll query it live.'],
  [/\b(how (do|does|did) (you|it|epoch) (work|measure|calculate|know|detect)|how accurate|accuracy|reliable|can i trust|methodology|method)\b/, () =>
    'Here’s exactly what I do:\n• Download NASA’s MODIS Bands 7-2-1 image of the place for the date you ask about.\n• Label every pixel as open water, dense canopy, lighter vegetation, bare ground, snow/ice/salt, burn scar or cloud, using standard indices (NDVI, NBR) and infrared thresholds.\n• Convert pixel counts to km², correcting for latitude.\n• For changes, compare the two scenes pixel by pixel, skipping anything hidden by cloud in either one.\n\n**How far to trust it:** this is browse imagery at 250–500 m, not a calibrated science product. Expect a few percent of noise; small lakes and narrow rivers are under-counted; high cloud, smoke and salt flats can be confused with snow or cloud. I flag scenes that are heavily obscured rather than hide them.'],
];

/* --------------------------------- helpers --------------------------------- */
const brief = (p) => ({ id: p.id || null, name: p.name, region: p.region || '', lat: p.lat, lon: p.lon, span: p.span, target: p.target || 'water', custom: !!p.custom });
const geoOf = (p) => ({ id: p.id || undefined, lat: p.lat, lon: p.lon, span: p.span });
const km = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch {
          out[k] = null;
        }
      }
    })
  );
  return out;
}

/** Biggest mover among the tracked quantities — used when the user named none. */
function autoTarget(a, b) {
  let best = 'water';
  let top = -1;
  for (const key of ['water', 'forest', 'vegetation', 'snow', 'burn']) {
    const d = Math.abs((S.metricValue(b, key) || 0) - (S.metricValue(a, key) || 0));
    if (d > top) (top = d), (best = key);
  }
  return best;
}

function breakdown(stats) {
  const rows = S.SURFACE_KEYS.map((k) => [S.classByKey(k).label, stats[`${k}_km2`] || 0]).filter((r) => r[1] > 0);
  rows.sort((x, y) => y[1] - x[1]);
  return rows;
}

const HELP_SUGGESTIONS = ['What changed at the Aral Sea since 2000?', 'Any wildfires right now?', 'Which place changed the most?', 'How do you measure?'];

/* ---------------------------------- answer ---------------------------------- */
export async function answer(rawText, ctx, places) {
  const text = norm(rawText).slice(0, 400);
  const latest = latestISO();
  const reply = (content, extra = {}) => ({ content, cards: [], actions: [], suggestions: [], ...extra });
  if (!text) return reply('Ask me about a place, a date, or what’s happening on Earth right now.', { suggestions: HELP_SUGGESTIONS });

  /* -- small talk & knowledge -- */
  if (/^(hi|hello|hey|yo|hola|good (morning|afternoon|evening))\b/.test(text) && text.length < 30) {
    return reply('Hello. I measure change in NASA satellite imagery. Name a place and a time span and I’ll tell you what the pixels say.', { suggestions: HELP_SUGGESTIONS });
  }
  if (/^(thanks|thank you|thx|cheers|great|nice|cool|ok|okay)\b/.test(text) && text.length < 30) {
    return reply('Any time. Want another place or another year?', { suggestions: HELP_SUGGESTIONS.slice(0, 3) });
  }
  if (/\b(who|what) are you\b|\bare you (an? )?(ai|llm|chatgpt|gpt|human|bot|robot)\b|\bwhich model\b/.test(text)) {
    return reply(
      'I’m Epoch’s analyst: a satellite-image analysis engine with a plain-language front end. I’m **not** a large language model, so I can’t chat about arbitrary topics or write essays. What I can do is download NASA imagery for any place and date since 2000, classify every pixel, measure what changed, and look up live natural events. Every number I give you is computed, never guessed.',
      { suggestions: HELP_SUGGESTIONS }
    );
  }
  if (/\b(help|what can you do|what can i ask|commands|examples|capabilities)\b/.test(text)) {
    return reply(
      'Things I can do:\n• **Measure change** — “What changed at Lake Mead between 2005 and 2022?”\n• **Trends** — “Show the trend for Lake Urmia”\n• **One-off readings** — “How much water is in the Aral Sea today?”\n• **Anywhere on Earth** — “Compare Lake Chad 2001 vs today”\n• **Live events** — “Any wildfires right now?”, “storms near Australia”\n• **Drive the app** — “Take me to Greenland in snow & ice”, “Open the timelapse for Rondônia”\n• **Track places** — “Track Lake Powell”\n• **Explain** — “What is bands 7-2-1?”, “How do you measure?”',
      { suggestions: HELP_SUGGESTIONS }
    );
  }
  for (const [re, fn] of KNOWLEDGE) {
    if (re.test(text) && /\b(what|how|why|explain|tell me about|define|meaning|where)\b/.test(text) && !/\b(changed?|compare|trend|take me|show me|go to)\b/.test(text)) {
      return reply(fn(), { suggestions: ['How do you measure?', 'What changed at Lake Mead since 2000?'] });
    }
  }

  /* -- classify the request -- */
  const eventCat = EVENT_WORDS.find(([, re]) => re.test(text))?.[0] || null;
  const wantsEvents =
    /\b(events?|happening|going on|active|right now|currently|at the moment|any|latest|recent|live)\b/.test(text) && (eventCat || /\bevents?\b|\bdisasters?\b|\bhappening\b|\bgoing on\b/.test(text));
  const wantsTrend = /\b(trend|over time|over the years|history|historical|year by year|each year|every year|chart|graph|timeline|long.?term)\b/.test(text);
  const wantsChange = /\b(chang(e|ed|es|ing)|compar(e|ed|ison)|difference|differ|vs\.?|versus|lost|lose|losing|gain(ed)?|shr(i|a|u)nk|shrinking|dr(y|ied|ying)|grow(n|ing|th)?|grew|recover(ed|ing|y)?|receded?|retreat(ed|ing)?|expand(ed|ing)?|since|between|before and after|how much (less|more|smaller|bigger))\b/.test(text);
  const wantsMeasure = /\b(how (much|big|large|many)|area|size|extent|measure|surface|coverage|how is|status of|state of)\b/.test(text);
  const wantsTrack = /\b(track|follow|monitor|add to (my )?(watchlist|places|library)|start watching|keep an eye on)\b/.test(text) || /^(watch|add|save) /.test(text);
  const wantsUntrack = /\b(untrack|unwatch|unfollow|stop (watching|tracking|following)|remove .* from (my )?(watchlist|places))\b/.test(text);
  const wantsGo = /\b(take me|go to|fly|zoom|navigate|show|open|view|find|locate|where is|look at|see|display|bring up|pull up|switch to|jump to)\b/.test(text);
  const wantsRank = /\b(most|biggest|largest|worst|fastest|top|rank|ranking|which place|which of)\b/.test(text) && /\b(chang|los|shr|declin|grow|recover|place|worst|critical)/.test(text);
  const wantsBrief = /\b(brief(ing)?|summar(y|ize|ise)|what'?s new|whats new|overview|report|catch me up|update me|headlines)\b/.test(text);
  const view = VIEW_WORDS.find(([, re]) => re.test(text))?.[0] || null;
  const layer = LAYER_WORDS.find(([, re]) => re.test(text))?.[0] || null;
  const targetWord = TARGET_WORDS.find(([, re]) => re.test(text))?.[0] || null;

  /* -- live events -- */
  if (wantsEvents || (eventCat && !wantsChange && !wantsTrend && /\b(any|where|list|current|now|today|active|are there)\b/.test(text))) {
    let events;
    try {
      events = await fetchEvents({ days: 30, category: eventCat || undefined });
    } catch {
      return reply('NASA’s event tracker (EONET) isn’t responding right now, so I can’t list live events. Imagery and measurements still work.');
    }
    const label = eventCat ? EVENT_CATEGORIES[eventCat].toLowerCase() : 'natural';
    let near = null;
    const tracked = findTracked(text, places);
    const phrase = !tracked && /\b(near|in|around|over|at)\b/.test(text) ? locationPhrase(text) : null;
    if (tracked) near = tracked.place;
    else if (phrase) near = (await geocode(phrase, 1))[0] || null;
    let list = events;
    if (near) {
      list = events.map((e) => ({ ...e, distance: Math.round(km(near, e)) })).filter((e) => e.distance <= 2500).sort((a, b) => a.distance - b.distance);
    }
    if (!list.length) {
      return reply(
        near
          ? `NASA EONET lists no open ${label} events within 2,500 km of ${near.name} in the last 30 days. Worldwide it currently tracks ${events.length}.`
          : `NASA EONET lists no open ${label} events in the last 30 days.`,
        { suggestions: ['Any natural events right now?', 'Any storms right now?'] }
      );
    }
    const counts = {};
    for (const e of list) counts[e.categoryLabel] = (counts[e.categoryLabel] || 0) + 1;
    const mix = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k.toLowerCase()}${v === 1 ? '' : 's'}`.replace('ss', 's')).slice(0, 4).join(', ');
    const top = list[0];
    return reply(
      `NASA EONET currently lists **${list.length} open ${label} event${list.length === 1 ? '' : 's'}** from the last 30 days${near ? ` within 2,500 km of ${near.name}` : ''}${eventCat ? '' : ` (${mix})`}. Most recently updated: **${top.title}**, ${S.fmtDay(top.date)}${top.magnitude ? ` — ${top.magnitude.toLocaleString('en-US')} ${top.unit}` : ''}. Tap any of them to see that day’s imagery on the globe.`,
      { cards: [{ type: 'events', items: list.slice(0, 8), total: list.length }], suggestions: ['Any storms right now?', 'Any volcanoes erupting?', 'Icebergs right now'] }
    );
  }

  /* -- which place? -- */
  const tracked = findTracked(text, places);
  let place = tracked?.place || null;
  let adhoc = false;
  let phrase = null;
  if (!place) {
    phrase = locationPhrase(text);
    if (phrase) {
      const hits = await geocode(phrase, 1);
      if (hits[0]) {
        const h = hits[0];
        place = { name: h.name, region: h.region, lat: h.lat, lon: h.lon, span: h.span, target: h.ice ? 'snow' : h.water ? 'water' : null, kind: h.kind };
        adhoc = true;
      }
    }
  }
  const refersHere = /\b(here|this place|this area|this one|it|there|current place|same place)\b/.test(text);
  if (!place && (refersHere || wantsChange || wantsTrend || wantsMeasure) && ctx?.placeId) {
    const cur = places.find((p) => p.id === ctx.placeId);
    // Only fall back to the on-screen place when the user plausibly meant it.
    if (cur && (refersHere || ['compare', 'timelapse'].includes(ctx.view) || (ctx.view === 'explore' && ctx.focusPlace))) place = cur;
  }

  /* -- briefing / ranking across the library -- */
  if ((wantsRank || wantsBrief) && !tracked && !adhoc) {
    const rows = await pool(places, 4, async (p) => {
      const pts = validPoints(await cachedSeries(geoOf(p)), p.target);
      if (pts.length < 2) return null;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const tc = S.trendChange(pts);
      return { id: p.id, name: p.name, target: p.target, first, last, prev, tc, total: tc ? tc.pct : null, yoy: S.pct(prev.value, last.value) };
    });
    const ok = rows.filter((r) => r && r.total != null && isFinite(r.total));
    if (!ok.length) return reply('I don’t have enough measured years yet to rank your places. Open a place’s Timelapse once and I’ll measure its full record.');
    if (wantsBrief) {
      const movers = ok.filter((r) => r.yoy != null && isFinite(r.yoy)).sort((a, b) => Math.abs(b.yoy) - Math.abs(a.yoy)).slice(0, 3);
      let events = [];
      try {
        events = await fetchEvents({ days: 30 });
      } catch {
        /* optional */
      }
      const { count } = await supabase.from('alerts').select('id', { count: 'exact', head: true }).in('place_id', places.map((p) => p.id));
      const lines = movers.map((r) => `• **${r.name}** — ${S.targetOf(r.target).short} ${S.fmtPct(r.yoy)} since ${r.prev.year} (${S.fmtKm2(r.prev.value)} → ${S.fmtKm2(r.last.value)})`);
      return reply(
        `Here’s where things stand across your ${places.length} places.\n\n**Biggest year-on-year moves**\n${lines.join('\n')}\n\n**Alerts on record:** ${count ?? 0}, all derived from measured trends.` +
          (events.length ? `\n**Earth right now:** NASA EONET is tracking ${events.length} open natural events from the last 30 days.` : ''),
        { cards: [{ type: 'ranking', by: 'yoy', items: movers.map((r) => ({ id: r.id, name: r.name, target: r.target, pct: r.yoy, from: r.prev, to: r.last })) }], suggestions: ['Which place changed the most?', 'Any wildfires right now?'] }
      );
    }
    ok.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const top = ok[0];
    return reply(
      `Comparing the first three clear years with the latest three (medians, so one hazy scene can’t skew it), **${top.name}** has changed the most: ${S.targetOf(top.target).short} ${S.fmtPct(top.total)} (about ${S.fmtKm2(top.tc.from)} around ${top.first.year} → ${S.fmtKm2(top.tc.to)} around ${top.last.year}).`,
      {
        cards: [{ type: 'ranking', by: 'total', items: ok.slice(0, 8).map((r) => ({ id: r.id, name: r.name, target: r.target, pct: r.total, from: r.first, to: r.last })) }],
        suggestions: [`Show the trend for ${top.name}`, `Compare ${top.name} ${top.first.year} vs ${top.last.year}`],
      }
    );
  }

  /* -- untrack / track -- */
  if (wantsUntrack) {
    if (place && !adhoc) return reply(`Removed **${place.name}** from your watchlist.`, { actions: [{ type: 'watch', placeId: place.id, on: false }] });
    return reply('Tell me which tracked place to stop watching — for example “stop watching Lake Mead”.');
  }
  if (wantsTrack && place) {
    if (!adhoc) return reply(`**${place.name}** is on your watchlist. I’ll flag measured changes in Alerts.`, { actions: [{ type: 'watch', placeId: place.id, on: true }], suggestions: [`Show the trend for ${place.name}`] });
    const target = targetWord || place.target || 'water';
    return reply(
      `Adding **${place.name}** (${place.region}) to your places. I’ll measure ${S.targetOf(target).short} there once a year back to 2001 — open it in Timelapse to watch the record fill in.`,
      { actions: [{ type: 'track', place: { name: place.name, region: place.region, lat: place.lat, lon: place.lon, span: place.span, target } }] }
    );
  }
  if (wantsTrack && !place) return reply(phrase ? `I couldn’t find “${phrase}” on the map. Try a fuller name, or coordinates like “45.1, 59.7”.` : 'Which place should I track? Try “track Lake Powell”.');

  /* -- pure navigation / layer / date -- */
  const tokens = parseDates(text, latest);
  const analytic = wantsChange || wantsTrend || wantsMeasure;
  if (!analytic && (wantsGo || view || layer || (tokens.length && !place))) {
    const actions = [];
    const bits = [];
    if (layer) {
      actions.push({ type: 'layer', id: layer });
      bits.push(`switched imagery to ${{ snowice: 'Snow & Ice (bands 3-6-7)', landwater: 'Land & Water (bands 7-2-1)', viirs: 'VIIRS true colour', truecolor: 'MODIS true colour' }[layer]}`);
    }
    const dates = tokens.length ? resolveDates(tokens, place || { lat: 0 }, latest) : [];
    if (place && !adhoc) {
      const v = view && ['compare', 'timelapse', 'explore'].includes(view) ? view : 'explore';
      if (v === 'compare' && dates.length >= 2) {
        const [a, b] = [dates[0].iso, dates[1].iso].sort();
        actions.push({ type: 'compare', placeId: place.id, a, b });
      } else actions.push({ type: 'navigate', view: v, placeId: place.id, date: v === 'explore' && dates[0] ? dates[0].iso : undefined });
      bits.unshift(v === 'explore' ? `flying to ${place.name}` : `opened ${v === 'compare' ? 'Compare' : 'Timelapse'} for ${place.name}`);
      return reply(`Done — ${bits.join(', ')}${dates[0] && v === 'explore' ? `, imagery from ${S.fmtDay(dates[0].iso)}` : ''}.`, {
        actions,
        suggestions: [`What changed at ${place.name}?`, `Show the trend for ${place.name}`],
      });
    }
    if (place && adhoc) {
      actions.push({ type: 'flyTo', name: place.name, lat: place.lat, lon: place.lon, span: place.span, date: dates[0]?.iso });
      bits.unshift(`flying to ${place.name}, ${place.region}`);
      return reply(`Done — ${bits.join(', ')}${dates[0] ? `, imagery from ${S.fmtDay(dates[0].iso)}` : ''}. It isn’t in your library yet.`, {
        actions,
        suggestions: [`Track ${place.name}`, `What changed at ${place.name} since 2005?`],
      });
    }
    if (dates.length) {
      actions.push({ type: 'navigate', view: 'explore', date: dates[0].iso });
      bits.push(`globe set to ${S.fmtDay(dates[0].iso)}`);
    } else if (view) {
      actions.push({ type: 'navigate', view });
      bits.push(`opened ${view[0].toUpperCase()}${view.slice(1)}`);
    } else if (layer) actions.push({ type: 'navigate', view: 'explore' });
    if (actions.length) return reply(`Done — ${bits.join(', ')}.`, { actions });
    if (phrase) return reply(`I couldn’t find “${phrase}” on the map. Try a fuller name (“Lake Powell, Utah”) or coordinates like “37.0, -111.3”.`);
  }

  /* -- measurements need a place -- */
  if (!place) {
    if (phrase) return reply(`I couldn’t find “${phrase}” on the map. Try a fuller name, or coordinates like “45.1, 59.7”.`, { suggestions: HELP_SUGGESTIONS.slice(0, 2) });
    return reply(
      'I couldn’t tie that to a place or a measurement. I’m an image-analysis engine rather than a general chatbot, so I work best with questions like the ones below.',
      { suggestions: HELP_SUGGESTIONS }
    );
  }

  const geo = geoOf(place);
  const target0 = targetWord && S.TARGETS[targetWord] ? (targetWord === 'water' && place.target === 'flood' ? 'flood' : targetWord) : place.target;

  /* -- trend -- */
  if (wantsTrend && !(tokens.length >= 2 && /\bvs\b|\bversus\b|\bcompare\b/.test(text))) {
    const target = target0 || 'water';
    let rows = [];
    let total = 0;
    if (!adhoc) {
      const dates = seriesDates(place);
      total = dates.length;
      rows = await cachedSeries(geo);
      const have = new Set(rows.map((r) => r.date));
      const missing = dates.filter((d) => !have.has(d));
      if (missing.length) {
        // Fill what fits in one request; the app finishes the rest in the background.
        const step = Math.max(1, Math.ceil(missing.length / 6));
        const pick = missing.filter((_, i) => i % step === 0).slice(0, 6);
        const fresh = await pool(pick, 3, (d) => measure(geo, d, { best: true, target: place.target }));
        rows = [...rows, ...fresh.filter(Boolean)].sort((a, b) => (a.date < b.date ? -1 : 1));
      }
    } else {
      const md = place.lat >= 0 ? '08-15' : '02-15';
      const lastY = `${latest.slice(0, 4)}-${md}` <= latest ? Number(latest.slice(0, 4)) : Number(latest.slice(0, 4)) - 1;
      const years = [2001, 2006, 2011, 2016, 2021, lastY].filter((y, i, a) => a.indexOf(y) === i);
      total = years.length;
      rows = (await pool(years.map((y) => `${y}-${md}`), 3, (d) => measure(geo, d, { best: true, target }))).filter(Boolean);
    }
    const pts = validPoints(rows, target);
    if (pts.length < 2) return reply(`I could only get ${pts.length} clear reading${pts.length === 1 ? '' : 's'} for ${place.name} so far, which isn’t enough for a trend. Cloud is the usual culprit — try again, or open its Timelapse to let me work through every year.`);
    const t = S.targetOf(target);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const lo = pts.reduce((m, p) => (p.value < m.value ? p : m));
    const hi = pts.reduce((m, p) => (p.value > m.value ? p : m));
    const d = S.pct(first.value, last.value);
    const partial = !adhoc && pts.length < total - 2;
    return reply(
      `**${place.name} — ${t.label.toLowerCase()}, ${first.year}–${last.year}.** ${S.fmtKm2(first.value)} in ${first.year} → ${S.fmtKm2(last.value)} in ${last.year}${d == null ? '' : ` (${S.fmtPct(d)})`}. Highest: ${S.fmtKm2(hi.value)} in ${hi.year}. Lowest: ${S.fmtKm2(lo.value)} in ${lo.year}. Based on ${pts.length} clear yearly scenes${adhoc ? ' (a six-year sample — track the place for the full record)' : ''}${partial ? `; I’m still measuring the remaining years` : ''}.`,
      {
        cards: [{ type: 'series', place: brief(place), target, points: pts }],
        actions: adhoc ? [] : [{ type: 'navigate', view: 'timelapse', placeId: place.id, soft: true }],
        suggestions: adhoc ? [`Track ${place.name}`, `Compare ${place.name} ${first.year} vs ${last.year}`] : [`Compare ${place.name} ${lo.year} vs ${hi.year}`, 'Which place changed the most?'],
      }
    );
  }

  /* -- single reading -- */
  const dates = resolveDates(tokens, { ...place, month_day: place.month_day }, latest);
  if (wantsMeasure && !wantsChange && dates.length <= 1) {
    const d = dates[0] || { iso: latest, exact: true };
    let m;
    try {
      m = await measure(geo, d.iso, { best: !d.exact, target: target0 || 'water' });
    } catch {
      return reply(`I couldn’t read NASA’s imagery for ${place.name} on ${S.fmtDay(d.iso)}. Try a nearby date.`);
    }
    if (m.quality === 'none') return reply(`There’s no usable imagery over ${place.name} on ${S.fmtDay(m.used_date)} — the satellite’s swath missed it or data is missing. Try a nearby date.`);
    const target = target0 || 'water';
    const t = S.targetOf(target);
    const rows = breakdown(m);
    return reply(
      `**${place.name}, ${S.fmtDay(m.used_date)}:** ${t.label.toLowerCase()} measures **${S.fmtKm2(S.metricValue(m, target))}** inside a ${S.fmtKm2(m.total_km2)} frame. The rest of the visible ground: ${rows.filter((r) => r[0] !== S.classByKey(target === 'flood' ? 'water' : target).label).slice(0, 3).map((r) => `${r[0].toLowerCase()} ${S.fmtKm2(r[1])}`).join(', ')}.` +
        (m.cloud_pct + m.nodata_pct >= 12 ? ` Note: ${Math.round(m.cloud_pct + m.nodata_pct)}% of the scene is hidden by cloud or gaps, so treat this as a floor.` : '') +
        (!d.exact && m.used_date !== d.iso ? ` (Clearest day near ${S.fmtDay(d.iso)}.)` : ''),
      {
        cards: [{ type: 'measure', place: brief(place), target, m }],
        suggestions: [`What changed at ${place.name} since ${Math.max(2001, Number(m.used_date.slice(0, 4)) - 10)}?`, `Show the trend for ${place.name}`],
      }
    );
  }

  /* -- change between two dates (the default for a named place) -- */
  let da;
  let db;
  if (dates.length >= 2) [da, db] = [dates[0], dates[1]].sort((x, y) => (x.iso < y.iso ? -1 : 1));
  else if (dates.length === 1) {
    const only = dates[0];
    const md = place.month_day || (place.lat >= 0 ? '08-15' : '02-15');
    const lastY = `${latest.slice(0, 4)}-${md}` <= latest ? Number(latest.slice(0, 4)) : Number(latest.slice(0, 4)) - 1;
    const recent = { iso: `${lastY}-${md}`, exact: false };
    if (only.latest || only.iso >= recent.iso) {
      da = !adhoc && place.before ? { iso: place.before, exact: true } : { iso: `2001-${md}`, exact: false };
      db = only;
    } else {
      da = only;
      db = recent;
    }
  } else if (!adhoc && place.before && place.after) {
    da = { iso: place.before, exact: true };
    db = { iso: place.after, exact: true };
  } else {
    const md = place.lat >= 0 ? '08-15' : '02-15';
    const lastY = `${latest.slice(0, 4)}-${md}` <= latest ? Number(latest.slice(0, 4)) : Number(latest.slice(0, 4)) - 1;
    da = { iso: `2001-${md}`, exact: false };
    db = { iso: `${lastY}-${md}`, exact: false };
  }
  if (da.iso === db.iso) return reply(`Both dates resolve to ${S.fmtDay(da.iso)}. Give me two different moments — for example “${place.name} 2005 vs 2020”.`);

  let result;
  try {
    // For loose dates ("2005"), first find the clearest scene that season.
    const [ua, ub] = await Promise.all([
      da.exact ? da.iso : measure(geo, da.iso, { best: true, target: target0 || 'water' }).then((m) => m.used_date),
      db.exact ? db.iso : measure(geo, db.iso, { best: true, target: target0 || 'water' }).then((m) => m.used_date),
    ]);
    result = await compareDays(geo, ua, ub);
  } catch (err) {
    return reply(`I couldn’t read NASA’s imagery for ${place.name} just now (${String(err.message || err).slice(0, 80)}). Please try again in a moment.`);
  }
  const target = target0 || autoTarget(result.a, result.b);
  const n = S.narrate({ name: place.name, target, a: result.a, b: result.b, transitions: result.transitions });
  const clamped = dates.some((d) => d.clamped);
  return reply(`**${n.headline}.** ${n.lines.join(' ')}${clamped ? ' (The MODIS record starts on 24 Feb 2000, so I used the earliest scene available.)' : ''}`, {
    cards: [{ type: 'change', place: brief(place), target, a: result.a, b: result.b, transitions: result.transitions, headline: n.headline, delta: n.delta }],
    actions: adhoc ? [] : [{ type: 'compare', placeId: place.id, a: result.a.date, b: result.b.date, soft: true }],
    suggestions: adhoc ? [`Track ${place.name}`, `Show the trend for ${place.name}`] : [`Show the trend for ${place.name}`, `Timelapse of ${place.name}`],
  });
}
