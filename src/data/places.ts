import type { LayerId } from "@/lib/gibs";

export type Category = "Water" | "Forest" | "Fire" | "Flood" | "Wetland";
export type Status = "Critical" | "Watching" | "Recovering" | "Stable";

export interface SeriesPoint {
  year: number;
  value: number;
}

export interface Place {
  id: string;
  name: string;
  region: string;
  category: Category;
  status: Status;
  lat: number;
  lon: number;
  span: number;
  zoom: number;
  layer: LayerId;
  before: string;
  after: string;
  years: [number, number];
  monthDay: string;
  metric: { label: string; unit: string; decimals: number; series: SeriesPoint[] };
  headline: string;
  summary: string;
  signals: { label: string; value: string; tone: "red" | "orange" | "blue" | "green" }[];
  color: string;
  lastPass: string;
  cloud: number;
}

/** Interpolate yearly values between key points with a touch of deterministic noise. */
function build(points: [number, number][], noise = 0.018, seed = 11): SeriesPoint[] {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: SeriesPoint[] = [];
  const first = points[0][0];
  const last = points[points.length - 1][0];
  for (let y = first; y <= last; y++) {
    const i = points.findIndex((p) => p[0] >= y);
    const key = points[i][0] === y;
    let v: number;
    if (key) v = points[i][1];
    else {
      const [y0, v0] = points[i - 1];
      const [y1, v1] = points[i];
      v = v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
      v += (rnd() - 0.5) * 2 * noise * v;
    }
    out.push({ year: y, value: Math.round(v * 10) / 10 });
  }
  return out;
}

export const PLACES: Place[] = [
  {
    id: "aral",
    name: "Aral Sea",
    region: "Kazakhstan · Uzbekistan",
    category: "Water",
    status: "Critical",
    lat: 45.15,
    lon: 59.75,
    span: 4.4,
    zoom: 6.1,
    layer: "truecolor",
    before: "2000-08-25",
    after: "2018-08-21",
    years: [2000, 2024],
    monthDay: "08-21",
    metric: {
      label: "Surface water",
      unit: "km²",
      decimals: 0,
      series: build([[2000, 24500], [2005, 17800], [2009, 10800], [2010, 13200], [2014, 7300], [2017, 8100], [2020, 7600], [2024, 6900]], 0.02, 3),
    },
    headline: "Eastern basin dried out completely in 2014",
    summary:
      "Once the world’s fourth-largest lake, the Aral Sea has been shrinking since rivers feeding it were diverted for irrigation. The eastern basin went fully dry for the first time in modern history in 2014.",
    signals: [
      { label: "Shoreline retreat", value: "148 km", tone: "red" },
      { label: "Exposed seabed", value: "+17,600 km²", tone: "orange" },
      { label: "Dust-storm risk", value: "High", tone: "orange" },
    ],
    color: "#64d2ff",
    lastPass: "2h ago",
    cloud: 3,
  },
  {
    id: "mead",
    name: "Lake Mead",
    region: "Nevada · Arizona, USA",
    category: "Water",
    status: "Watching",
    lat: 36.17,
    lon: -114.45,
    span: 0.85,
    zoom: 8.6,
    layer: "truecolor",
    before: "2000-07-18",
    after: "2022-07-21",
    years: [2000, 2024],
    monthDay: "07-21",
    metric: {
      label: "Water elevation",
      unit: "ft",
      decimals: 0,
      series: build([[2000, 1214], [2004, 1135], [2006, 1130], [2010, 1095], [2011, 1120], [2016, 1075], [2019, 1090], [2021, 1068], [2022, 1047], [2023, 1066], [2024, 1061]], 0.004, 5),
    },
    headline: "Record low in July 2022 exposed decades-old shoreline",
    summary:
      "The largest reservoir in the United States supplies water to 25 million people. Two decades of drought on the Colorado River drained it to its lowest level since it was filled in the 1930s.",
    signals: [
      { label: "Bathtub ring", value: "~150 ft", tone: "orange" },
      { label: "Surface area", value: "−38%", tone: "red" },
      { label: "2023 rebound", value: "+19 ft", tone: "green" },
    ],
    color: "#0a84ff",
    lastPass: "4h ago",
    cloud: 0,
  },
  {
    id: "rondonia",
    name: "Rondônia",
    region: "Amazon Basin, Brazil",
    category: "Forest",
    status: "Critical",
    lat: -10.3,
    lon: -62.9,
    span: 3.4,
    zoom: 6.5,
    layer: "truecolor",
    before: "2000-07-12",
    after: "2021-07-08",
    years: [2000, 2024],
    monthDay: "07-10",
    metric: {
      label: "Forest cover",
      unit: "%",
      decimals: 1,
      series: build([[2000, 71], [2004, 64], [2008, 58], [2012, 55], [2016, 52], [2019, 48], [2021, 45.5], [2024, 44.2]], 0.01, 9),
    },
    headline: "The “fishbone” clearing pattern keeps spreading",
    summary:
      "Roads branching off highway BR-364 opened the forest to settlement, producing one of the most recognisable deforestation signatures visible from orbit.",
    signals: [
      { label: "Canopy loss", value: "−27 pts", tone: "red" },
      { label: "New clearings", value: "48 km²", tone: "orange" },
      { label: "Fire scars", value: "Moderate", tone: "orange" },
    ],
    color: "#30d158",
    lastPass: "6h ago",
    cloud: 12,
  },
  {
    id: "sindh",
    name: "Indus Floods",
    region: "Sindh, Pakistan",
    category: "Flood",
    status: "Recovering",
    lat: 27.3,
    lon: 68.1,
    span: 3.6,
    zoom: 6.3,
    layer: "landwater",
    before: "2021-08-28",
    after: "2022-08-28",
    years: [2008, 2024],
    monthDay: "08-28",
    metric: {
      label: "Inundated area",
      unit: "km²",
      decimals: 0,
      series: build([[2008, 1900], [2009, 1700], [2010, 19800], [2011, 9400], [2012, 3100], [2015, 2600], [2020, 3400], [2021, 2200], [2022, 31500], [2023, 6400], [2024, 3900]], 0.05, 4),
    },
    headline: "Monsoon turned the Indus into an inland sea",
    summary:
      "Record monsoon rains in 2022 swelled the Indus into a lake tens of kilometres wide. In Land & Water false color, floodwater appears deep blue against green fields.",
    signals: [
      { label: "Peak flood extent", value: "31,500 km²", tone: "red" },
      { label: "Receded since peak", value: "−88%", tone: "green" },
      { label: "Croplands affected", value: "High", tone: "orange" },
    ],
    color: "#5e5ce6",
    lastPass: "1h ago",
    cloud: 8,
  },
  {
    id: "nsw",
    name: "Black Summer",
    region: "New South Wales, Australia",
    category: "Fire",
    status: "Recovering",
    lat: -36.2,
    lon: 149.6,
    span: 3.0,
    zoom: 6.7,
    layer: "truecolor",
    before: "2019-09-20",
    after: "2020-01-04",
    years: [2012, 2024],
    monthDay: "01-04",
    metric: {
      label: "Burned area",
      unit: "Mha",
      decimals: 1,
      series: build([[2012, 0.4], [2014, 0.3], [2016, 0.5], [2018, 0.6], [2019, 2.1], [2020, 5.5], [2021, 0.2], [2022, 0.3], [2024, 0.6]], 0.08, 6),
    },
    headline: "5.5 million hectares burned in a single season",
    summary:
      "The 2019–20 bushfire season blanketed south-east Australia in smoke visible from space. Today the scars are greening as eucalyptus forests resprout.",
    signals: [
      { label: "Burn severity", value: "Extreme", tone: "red" },
      { label: "Regrowth", value: "62% of scar", tone: "green" },
      { label: "Smoke plume", value: "> 1,000 km", tone: "orange" },
    ],
    color: "#ff9f0a",
    lastPass: "9h ago",
    cloud: 21,
  },
  {
    id: "urmia",
    name: "Lake Urmia",
    region: "West Azerbaijan, Iran",
    category: "Water",
    status: "Critical",
    lat: 37.7,
    lon: 45.45,
    span: 1.9,
    zoom: 7.5,
    layer: "truecolor",
    before: "2000-08-14",
    after: "2023-08-20",
    years: [2000, 2024],
    monthDay: "08-18",
    metric: {
      label: "Surface area",
      unit: "km²",
      decimals: 0,
      series: build([[2000, 5200], [2004, 4500], [2008, 3300], [2011, 2200], [2014, 1400], [2017, 1700], [2019, 3100], [2020, 2900], [2022, 1600], [2023, 1100], [2024, 1250]], 0.03, 8),
    },
    headline: "Iran’s largest lake has lost most of its water",
    summary:
      "Drought and upstream dams have shrunk Lake Urmia dramatically. Its shallow brine often turns red from salt-loving algae and bacteria, a shift that is easy to see from orbit.",
    signals: [
      { label: "Area lost", value: "−79%", tone: "red" },
      { label: "Color shift", value: "Red brine", tone: "orange" },
      { label: "Salt flats", value: "Expanding", tone: "orange" },
    ],
    color: "#ff375f",
    lastPass: "3h ago",
    cloud: 0,
  },
  {
    id: "marshes",
    name: "Mesopotamian Marshes",
    region: "Southern Iraq",
    category: "Wetland",
    status: "Recovering",
    lat: 31.0,
    lon: 47.1,
    span: 2.4,
    zoom: 7,
    layer: "truecolor",
    before: "2000-07-20",
    after: "2019-08-05",
    years: [2000, 2024],
    monthDay: "08-01",
    metric: {
      label: "Marsh extent",
      unit: "km²",
      decimals: 0,
      series: build([[2000, 760], [2003, 1100], [2006, 4800], [2008, 3200], [2010, 2500], [2014, 3700], [2016, 2800], [2019, 5600], [2021, 3000], [2023, 1500], [2024, 1900]], 0.04, 2),
    },
    headline: "Drained in the 1990s, reflooded after 2003",
    summary:
      "Once the largest wetland in western Eurasia, the marshes were drained to under 10% of their former extent. Reflooding brought much of them back, but drought keeps testing the recovery.",
    signals: [
      { label: "Extent since 2000", value: "+150%", tone: "green" },
      { label: "Drought stress", value: "Elevated", tone: "orange" },
      { label: "Vegetation", value: "+6% YoY", tone: "green" },
    ],
    color: "#66d4cf",
    lastPass: "5h ago",
    cloud: 2,
  },
  {
    id: "saltlake",
    name: "Great Salt Lake",
    region: "Utah, USA",
    category: "Water",
    status: "Watching",
    lat: 41.1,
    lon: -112.55,
    span: 1.5,
    zoom: 7.8,
    layer: "truecolor",
    before: "2000-08-02",
    after: "2022-08-24",
    years: [2000, 2024],
    monthDay: "08-20",
    metric: {
      label: "Surface area",
      unit: "km²",
      decimals: 0,
      series: build([[2000, 4300], [2004, 3500], [2006, 3900], [2011, 4100], [2016, 3200], [2019, 3600], [2021, 2700], [2022, 2500], [2023, 3100], [2024, 2950]], 0.025, 12),
    },
    headline: "Record low in 2022, partial recovery after a snowy winter",
    summary:
      "Diversions and drought pushed the lake to its lowest level on record in 2022. A record snowpack in 2023 brought some water back, but the long-term trend is still down.",
    signals: [
      { label: "Area vs. 2000", value: "−31%", tone: "red" },
      { label: "Exposed lakebed", value: "1,800 km²", tone: "orange" },
      { label: "2023 rebound", value: "+600 km²", tone: "green" },
    ],
    color: "#bf5af2",
    lastPass: "7h ago",
    cloud: 5,
  },
];

export const placeById = (id: string) => PLACES.find((p) => p.id === id) ?? PLACES[0];

export function valueAt(place: Place, year: number) {
  const s = place.metric.series;
  const hit = s.find((p) => p.year === year);
  if (hit) return hit.value;
  if (year < s[0].year) return s[0].value;
  return s[s.length - 1].value;
}

export function changePct(place: Place, fromYear: number, toYear: number) {
  const a = valueAt(place, fromYear);
  const b = valueAt(place, toYear);
  return ((b - a) / a) * 100;
}

export type Severity = "critical" | "warning" | "info" | "good";
export interface Alert {
  id: string;
  placeId: string;
  title: string;
  body: string;
  time: string;
  group: "Today" | "Yesterday" | "This Week";
  severity: Severity;
}

export const ALERTS: Alert[] = [
  { id: "a1", placeId: "mead", title: "Shoreline exposed", body: "Water edge receded 410 m near Boulder Basin since the last clear pass.", time: "9:41 AM", group: "Today", severity: "warning" },
  { id: "a2", placeId: "mead", title: "Elevation below 1,065 ft", body: "Reservoir crossed a drought-contingency threshold this morning.", time: "8:12 AM", group: "Today", severity: "critical" },
  { id: "a3", placeId: "mead", title: "Cloud-free scene captured", body: "Terra MODIS acquired a 0% cloud scene. Ready to compare.", time: "7:30 AM", group: "Today", severity: "info" },
  { id: "a4", placeId: "aral", title: "Seabed exposure +2.1%", body: "New dry seabed detected along the western basin margin.", time: "6:05 AM", group: "Today", severity: "critical" },
  { id: "a5", placeId: "rondonia", title: "New clearing detected", body: "48 km² of canopy loss along the BR-364 corridor.", time: "Yesterday", group: "Yesterday", severity: "critical" },
  { id: "a6", placeId: "marshes", title: "Marsh recovery continues", body: "Vegetated wetland up 6% versus the same week last year.", time: "Yesterday", group: "Yesterday", severity: "good" },
  { id: "a7", placeId: "sindh", title: "Floodwater receding", body: "Standing water down 38% across the Manchar Lake region.", time: "Monday", group: "This Week", severity: "good" },
  { id: "a8", placeId: "urmia", title: "Color shift detected", body: "Lake reflectance shifted toward red — likely algae and brine.", time: "Sunday", group: "This Week", severity: "warning" },
  { id: "a9", placeId: "nsw", title: "Burn scar regrowth", body: "Vegetation recovering across 62% of the 2020 scar.", time: "Saturday", group: "This Week", severity: "good" },
  { id: "a10", placeId: "saltlake", title: "Salinity boundary moved", body: "North-arm color boundary shifted 3.4 km south.", time: "Saturday", group: "This Week", severity: "info" },
];

export interface Satellite {
  id: string;
  name: string;
  instrument: string;
  launched: number;
  color: string;
  status: "Imaging" | "Downlink" | "Idle";
  over: string;
  period: number;
  phase: number;
}

export const SATELLITES: Satellite[] = [
  { id: "terra", name: "Terra", instrument: "MODIS", launched: 1999, color: "#64d2ff", status: "Imaging", over: "Central Asia", period: 98.9, phase: 0.12 },
  { id: "noaa20", name: "NOAA-20", instrument: "VIIRS", launched: 2017, color: "#30d158", status: "Imaging", over: "Sahara", period: 101.4, phase: 0.71 },
  { id: "aqua", name: "Aqua", instrument: "MODIS", launched: 2002, color: "#0a84ff", status: "Downlink", over: "South Pacific", period: 98.8, phase: 0.46 },
  { id: "landsat9", name: "Landsat 9", instrument: "OLI-2", launched: 2021, color: "#ff9f0a", status: "Imaging", over: "Andes", period: 98.9, phase: 0.89 },
  { id: "snpp", name: "Suomi NPP", instrument: "VIIRS", launched: 2011, color: "#bf5af2", status: "Idle", over: "Antarctica", period: 101.4, phase: 0.28 },
];
