// Parcel autofill from free official City of Los Angeles map services (opt-in; nothing is sent until the user taps "Look up").
// Every source below was opened and tested for browser access (CORS) on 2026-10-25.
// This file has no runtime imports so the fixture recorder (scripts/record-parcel.mjs) can load it directly in Node.
import type { Poly, Pt } from '../core/geom';
/** Same cap as core/units MAX_LEN_MM (5000 ft), inlined so the fixture recorder can load this file without a bundler. */
const MAX_LEN_MM = 5000 * 304.8;

const LAHUB = 'https://maps.lacity.org/lahub/rest/services';
const ZIMAS = 'https://zimas.lacity.org/arcgis/rest/services';
export const PARCEL_HOSTS = ['https://maps.lacity.org', 'https://zimas.lacity.org'];

/** One entry per question we ask the city's maps. `layer` is an ArcGIS REST layer queried with the lot's point. */
export const PARCEL_SOURCES = {
  geocode: { name: 'LA City street locator (GeoHub)', url: `${LAHUB}/centerlineLocator/GeocodeServer/findAddressCandidates` },
  parcel: { name: 'LA City parcels, Landbase (GeoHub / NavigateLA)', url: `${LAHUB}/Landbase_Information/MapServer/5` },
  city: { name: 'LA City boundary (GeoHub)', url: `${LAHUB}/Boundaries/MapServer/7` },
  adjacent: { name: 'Adjacent cities (GeoHub)', url: `${LAHUB}/Boundaries/MapServer/1` },
  zoning: { name: 'Zoning (ZIMAS)', url: `${ZIMAS}/zma/zoning/MapServer/1102` },
  zoning1a: { name: 'Zoning, Chapter 1A (Downtown, ZIMAS)', url: `${ZIMAS}/zma/zoning/MapServer/1101` },
  hillside: { name: 'Hillside Ordinance area (GeoHub)', url: `${LAHUB}/Special_Areas/MapServer/6` },
  vhfhsz: { name: 'Very High Fire Hazard Severity Zones (GeoHub)', url: `${LAHUB}/Special_Areas/MapServer/11` },
  hpoz: { name: 'Historic Preservation Overlay Zones (GeoHub)', url: `${LAHUB}/City_Planning_Department/MapServer/10` },
  coastalDual: { name: 'Coastal Zone, dual permit area (ZIMAS)', url: `${ZIMAS}/zma/coastal_zones/MapServer/1603` },
  coastalSingle: { name: 'Coastal Zone, single permit area (ZIMAS)', url: `${ZIMAS}/zma/coastal_zones/MapServer/1604` },
  coastalCommission: { name: 'Coastal Commission permit area (ZIMAS)', url: `${ZIMAS}/zma/coastal_zones/MapServer/1605` },
  palisades: { name: 'Palisades Fire perimeter, 2025 (GeoHub WildfireRecovery)', url: `${LAHUB}/WildfireRecovery/MapServer/0` },
  buildings: { name: 'Building outlines, LARIAC 2023 (ZIMAS)', url: `${ZIMAS}/zma/bldgoutlines/MapServer/163` },
} as const;
export type SourceKey = keyof typeof PARCEL_SOURCES;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export type Tri3 = 'yes' | 'no' | 'unknown';

export interface ParcelFill {
  matched: string; zip: string; at: string;
  /** Lot outline in the local frame (mm, street edge first, lot above it), or null if the parcel layer failed. */
  lot: Poly | null; widthMm: number | null; depthMm: number | null;
  /** The street was found but no parcel carries this house number. */ noParcelMatch?: boolean;
  apn: string; zone: string; jurisdiction: 'la-city' | 'la-county' | 'other' | 'unknown'; cityName: string;
  flags: { hillside: Tri3; vhfhsz: Tri3; coastal: Tri3; hpoz: Tri3 };
  /** Sources that did not answer (their fields stay as they were). */
  failed: SourceKey[];
  zimasPin: string;
  /** The APN is made of several mapped pieces: the APN is filled, the lot shape is left to the user. */
  multiPiece: boolean;
  /** Degrees clockwise from sheet-up (the lot frame's +y) to true north. Null when no lot shape was drawn. */
  northDeg?: number | null;
  /** The parcel is a condo / common-interest "breakdown" parcel (BPP like 5143BRKDWN): no APN or lot shape is filled. */
  condo?: boolean;
  /** Downtown lot zoned under Chapter 1A (the zone string is new-code; this tool's rules may not cover it). */
  chapter1a?: boolean;
  /** The lot touches more than one zone; `zone` lists all of them. */
  splitZone?: boolean;
  /** Every layer answered but no parcel has this exact address (vacant or park lot, or a different address on the parcel). */
  noExactParcel?: boolean;
  /** Building outlines on the lot from the city map (lot frame, mm), largest first. Heights are not used: the layer's HEIGHT unit is not documented. */
  buildings?: Poly[];
  /** Inside the 2025 Palisades Fire perimeter (Eaton is in the county, outside LA City). */
  palisades?: Tri3;
}
export type ParcelError = 'offline' | 'empty' | 'not-found' | 'zip-mismatch' | 'direction-mismatch' | 'suffix-mismatch' | 'city-mismatch' | 'network' | 'no-parcel';
export type ParcelOutcome = { ok: true; fill: ParcelFill } | { ok: false; error: ParcelError; detail?: string };

/** "1234 W 52nd St, Los Angeles, CA 90037" -> street "1234 W 52nd St", zip "90037". */
export function splitAddress(raw: string): { street: string; zip: string } {
  const s = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const t = s.replace(/,?\s*(USA|U\.S\.A\.|United States(?: of America)?)\s*$/i, '').trim();
  const zip = t.match(/\b(9\d{4})(?:-\d{4})?\s*$/)?.[1] ?? '';
  // Unit words are cut only when a unit token follows ("Apt 2", "Ste #B"), so "1300 Suite Ave" keeps its street name.
  const street = (t.split(',')[0] ?? '').replace(/\b9\d{4}(?:-\d{4})?\s*$/, '').replace(/\s*#\s*\w{1,6}\s*$|\s+\b(apt|apartment|unit|ste|suite|spc|space)\b\.?\s*#?\s*(?!(?:ave|avenue|st|street|blvd|dr|drive|rd|road|way|pl|place|ln|lane|ct|court|ter|cir|hwy|pkwy)\b)[\w-]{1,6}\s*$/i, '').trim();
  return { street, zip };
}

const q = (o: Record<string, string | number>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
/** Ask a layer about the lot's own outline (shrunk about 1 m inward so lines shared with neighbors and streets do not count). */
export function polygonQueryUrl(layer: string, ring: number[][], geometry: boolean) {
  const r = ring.map(c => [Math.round(c[0] * 1e7) / 1e7, Math.round(c[1] * 1e7) / 1e7]);
  return `${layer}/query?${q({ geometry: JSON.stringify({ rings: [r], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: String(geometry), outSR: 4326, f: 'json' })}`;
}
export function pointQueryUrl(layer: string, x: number, y: number, geometry: boolean, distanceM = 0) {
  return `${layer}/query?${q({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', ...(distanceM ? { distance: distanceM, units: 'esriSRUnit_Meter' } : {}), outFields: '*', returnGeometry: String(geometry), outSR: 4326, f: 'json' })}`;
}
export function geocodeUrl(street: string, zip: string) {
  return `${PARCEL_SOURCES.geocode.url}?${q({ Street: street, ...(zip ? { ZIP: zip } : {}), outSR: 4326, maxLocations: 3, f: 'json' })}`;
}

/** Metres per degree at a latitude (WGS84 series), accurate to well under a millimetre across a lot. */
function mPerDeg(lat: number) {
  const r = lat * Math.PI / 180;
  return { lat: 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r), lon: 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r) };
}
const signedArea = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; } return a / 2; };
function segDist(p: Pt, a: Pt, b: Pt) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); }

/** Drop the closing point, points closer than 4" and points on a straight line (under 1 degree of turn). */
export function simplifyRing(ring: Pt[]): Pt[] {
  let p = ring.slice(); if (p.length > 1 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1) p.pop();
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y);
      const turn = Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
      if (ab < 100 || bc < 0.01 || turn < Math.PI / 180) { p.splice(i, 1); changed = true; break; }
    }
  }
  if (p.length > 8) { let far = 0, fd = 0; p.forEach((q2, i) => { const d = Math.hypot(q2.x - p[0].x, q2.y - p[0].y); if (d > fd) { fd = d; far = i; } });
    // 300 mm (about 1 ft): an arc's chord sag at that size is far below the 2 ft map error, so curves become a few usable edges.
    const s1 = dp(p.slice(0, far + 1), 300), s2 = dp([...p.slice(far), p[0]], 300); const r = [...s1.slice(0, -1), ...s2.slice(0, -1)]; if (r.length >= 3) p = r; }
  // Merge leftover short edges (under 4 ft) into a neighbor when the turn is gentle (under 30 degrees) and the area barely moves.
  const area0 = Math.abs(signedArea(p)); let merged = true;
  while (merged && p.length > 4) {
    merged = false;
    for (let i = 0; i < p.length && p.length > 4; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y);
      if (Math.min(ab, bc) >= 1219) continue;
      const turn = Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
      const np = p.filter((_, j) => j !== i);
      if (turn < Math.PI / 6 && Math.abs(Math.abs(signedArea(np)) - area0) / area0 < 0.004) { p = np; merged = true; break; }
    }
  }
  return p;
}

export interface LotFrame { lot: Poly; northDeg: number; toLot: (lon: number, lat: number) => Pt }
/**
 * Lon/lat ring -> local lot frame in mm: counter-clockwise, the street edge is edge 0 and runs along +x at the bottom,
 * the lot lies above it, and the lowest-left corner is near the origin. Never State Plane (UU008).
 * Street edge: among edges not shared with a neighboring parcel, the one whose LINE passes closest to the street point
 * (the locator slides the point along the street centerline, so it is near the front line's extension, far from side lines).
 * Also returns where true north points on the drawn sheet, and the transform for other shapes (buildings).
 */
export function lotFrame(ring: number[][], street: { x: number; y: number }, neighbors: number[][][] = []): LotFrame {
  const lat0 = ring.reduce((s, c) => s + c[1], 0) / ring.length, lon0 = ring.reduce((s, c) => s + c[0], 0) / ring.length; const m = mPerDeg(lat0);
  const toLocal = (lon: number, lat: number): Pt => ({ x: (lon - lon0) * m.lon * 1000, y: (lat - lat0) * m.lat * 1000 });
  let p = simplifyRing(ring.map(c => toLocal(c[0], c[1])));
  if (signedArea(p) < 0) p.reverse();
  const s = toLocal(street.x, street.y);
  const nb = neighbors.map(r => r.map(c => toLocal(c[0], c[1])));
  const shared = (a: Pt, b: Pt) => { const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return nb.some(r => r.some((c, k) => k > 0 && segDist(mid, r[k - 1], c) < 1000)); };
  const lineDist = (a: Pt, b: Pt) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return Math.abs((b.x - a.x) * (s.y - a.y) - (b.y - a.y) * (s.x - a.x)) / L; };
  // How far past the segment's ends the point's foot falls (0 when it lands on the segment).
  const beyond = (a: Pt, b: Pt) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; const t = ((s.x - a.x) * (b.x - a.x) + (s.y - a.y) * (b.y - a.y)) / L; return t < 0 ? -t : t > L ? t - L : 0; };
  const idx = p.map((_, i) => i); const free = idx.filter(i => !shared(p[i], p[(i + 1) % p.length]));
  const pool = free.length ? free : idx;
  const len = (i: number) => { const a = p[i], b = p[(i + 1) % p.length]; return Math.hypot(b.x - a.x, b.y - a.y); };
  const score = pool.filter(i => len(i) >= 1219).map(i => ({ i, d: lineDist(p[i], p[(i + 1) % p.length]) + beyond(p[i], p[(i + 1) % p.length]) * 0.5 }));
  const best = score.length ? score.reduce((o1, o2) => (o2.d < o1.d ? o2 : o1)).i : pool[0];
  p = [...p.slice(best), ...p.slice(0, best)];
  const a = p[0], b = p[1], th = Math.atan2(b.y - a.y, b.x - a.x), cs = Math.cos(-th), sn = Math.sin(-th);
  const rot = (q2: Pt) => ({ x: (q2.x - a.x) * cs - (q2.y - a.y) * sn, y: (q2.x - a.x) * sn + (q2.y - a.y) * cs });
  p = p.map(rot);
  const minX = Math.min(...p.map(q2 => q2.x)), minY = Math.min(...p.map(q2 => q2.y));
  const fin = (q2: Pt) => ({ x: Math.round((q2.x - minX) * 10) / 10, y: Math.round((q2.y - minY) * 10) / 10 });
  // After rotating by -th, true north (0,1) lands at (sin th, cos th): th degrees clockwise from sheet-up.
  const northDeg = Math.round((((th * 180 / Math.PI) % 360) + 360) % 360 * 10) / 10;
  return { lot: p.map(fin), northDeg, toLot: (lon, lat) => fin(rot(toLocal(lon, lat))) };
}
export const ringToLot = (ring: number[][], street: { x: number; y: number }): Poly => lotFrame(ring, street).lot;

/** First street-direction letter after the house number: "1232 W 52nd St" -> "W". */
export function streetDir(addr: string): string {
  return String(addr ?? '').toUpperCase().replace(/^U(?=\d)/, '').match(/^\s*\d+[A-Z]?(?:-\d+)?\s+([NSEW])\.?\s+\S/)?.[1] ?? '';
}
/** "500 W Manchester Blvd" -> "BLVD". Empty when the street has no type word. */
const SUFFIX: Record<string, string> = { AVE: 'AVE', AVENUE: 'AVE', AV: 'AVE', ST: 'ST', STREET: 'ST', BLVD: 'BLVD', BOULEVARD: 'BLVD', DR: 'DR', DRIVE: 'DR', RD: 'RD', ROAD: 'RD', WAY: 'WAY', PL: 'PL', PLACE: 'PL',
  LN: 'LN', LANE: 'LN', CT: 'CT', COURT: 'CT', TER: 'TER', TERRACE: 'TER', CIR: 'CIR', CIRCLE: 'CIR', HWY: 'HWY', HIGHWAY: 'HWY', PKWY: 'PKWY', PARKWAY: 'PKWY' };
export function streetType(addr: string): string {
  const w = String(addr ?? '').split(',')[0].toUpperCase().replace(/\./g, '').trim().split(/\s+/);
  return w.length >= 3 ? SUFFIX[w[w.length - 1]] ?? '' : '';
}
/** Incorporated cities in LA County other than Los Angeles, plus common unincorporated place names. The city's street
 * locator has many same-named streets ("Main St"), so an address that names one of these is never LA City. */
const NOT_LA = new Set(['agoura hills', 'alhambra', 'arcadia', 'artesia', 'avalon', 'azusa', 'baldwin park', 'bell', 'bell gardens', 'bellflower', 'beverly hills', 'bradbury', 'burbank', 'calabasas', 'carson', 'cerritos',
  'claremont', 'commerce', 'city of commerce', 'compton', 'covina', 'cudahy', 'culver city', 'diamond bar', 'downey', 'duarte', 'el monte', 'el segundo', 'gardena', 'glendale', 'glendora', 'hawaiian gardens', 'hawthorne',
  'hermosa beach', 'hidden hills', 'huntington park', 'industry', 'city of industry', 'inglewood', 'irwindale', 'la canada flintridge', 'la cañada flintridge', 'la habra heights', 'la mirada', 'la puente', 'la verne',
  'lakewood', 'lancaster', 'lawndale', 'lomita', 'long beach', 'lynwood', 'malibu', 'manhattan beach', 'maywood', 'monrovia', 'montebello', 'monterey park', 'norwalk', 'palmdale', 'palos verdes estates', 'paramount',
  'pasadena', 'pico rivera', 'pomona', 'rancho palos verdes', 'redondo beach', 'rolling hills', 'rolling hills estates', 'rosemead', 'san dimas', 'san fernando', 'san gabriel', 'san marino', 'santa clarita',
  'santa fe springs', 'santa monica', 'sierra madre', 'signal hill', 'south el monte', 'south gate', 'south pasadena', 'temple city', 'torrance', 'vernon', 'walnut', 'west covina', 'west hollywood', 'westlake village', 'whittier',
  'altadena', 'east los angeles', 'east la', 'view park', 'windsor hills', 'view park-windsor hills', 'ladera heights', 'marina del rey', 'topanga', 'florence', 'willowbrook', 'west athens', 'westmont', 'lennox',
  'hacienda heights', 'rowland heights', 'stevenson ranch', 'castaic']);
/** The place typed after the street ("2400 Main St, Santa Monica, CA" -> "santa monica"), or "" when none. */
function typedPlace(raw: string): string {
  const parts = raw.split(',').map(x => x.trim()).filter(Boolean); if (parts.length < 2) return '';
  let i = parts.findIndex(x => /^(ca|calif(ornia)?)(\s+\d{5}(-\d{4})?)?$/i.test(x)); if (i < 0) i = parts.length;
  return i >= 2 ? parts[i - 1].replace(/\s+\d{5}(-\d{4})?$/, '').trim().toLowerCase().replace(/\s+/g, ' ') : '';
}
/** Common names people type that the city's street list spells another way. */
const ALIASES: [RegExp, string][] = [
  [/\b(?:avenida\s+)?cesar\s+(?:e\.?\s+)?chavez(?:\s+ave(?:nue)?)?\b/i, 'Cesar E Chavez Ave'],
  [/\bmlk(?:\s+jr)?\s+blvd\b|\bmartin\s+luther\s+king(?:\s+jr\.?)?\s+blvd\b/i, 'Martin Luther King Jr Blvd'],
];
/** A lon/lat ring cut to at most ~40 points (about 0.3 m tolerance) so the query URL stays short. */
function queryRing(ring: number[][]): number[][] {
  if (ring.length <= 40) return ring;
  const lat0 = ring[0][1], m = mPerDeg(lat0); let tol = 300;
  const pts = ring.map(c => ({ x: (c[0] - ring[0][0]) * m.lon * 1000, y: (c[1] - lat0) * m.lat * 1000 }));
  let out = dp(pts, tol); while (out.length > 40 && tol < 5000) { tol *= 2; out = dp(pts, tol); }
  const r = out.map(p => [ring[0][0] + p.x / 1000 / m.lon, lat0 + p.y / 1000 / m.lat]); r[r.length - 1] = r[0]; return r;
}
/** Lon/lat ring pulled about 1 m toward a point inside it (so edges shared with neighbors are not "touching"). */
function shrinkRing(ring: number[][], inner: { x: number; y: number }): number[][] {
  const m = mPerDeg(inner.y);
  return ring.map(c => { const dx = (c[0] - inner.x) * m.lon, dy = (c[1] - inner.y) * m.lat, d = Math.hypot(dx, dy); const k = d > 0 ? Math.max(0.6, 1 - 1 / d) : 1;
    return [inner.x + (c[0] - inner.x) * k, inner.y + (c[1] - inner.y) * k]; });
}

/** "4302 N EDENHURST AVE" and "U4302 W Edenhurst Ave, 90039" -> "4302 edenhurst". Direction letters and suffixes vary between city lists. */
export function houseKey(addr: string): string {
  const m = String(addr ?? '').toUpperCase().replace(/^U(?=\d)/, '').match(/^\s*(\d+[A-Z]?)\s+(?:(?:N|S|E|W)\s+)?([A-Z0-9]+)/);
  return m ? `${m[1]} ${m[2]}`.toLowerCase() : '';
}
/** A point inside a lon/lat ring (its centroid when that is inside, else the middle of a diagonal that is). */
export function interiorPoint(ring: number[][]): { x: number; y: number } {
  const pts = ring.map(p => ({ x: p[0], y: p[1] }));
  const inside = (pt: { x: number; y: number }) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  let A = 0, cx = 0, cy = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], k = a.x * b.y - b.x * a.y; A += k; cx += (a.x + b.x) * k; cy += (a.y + b.y) * k; }
  const cen = A ? { x: cx / (3 * A), y: cy / (3 * A) } : pts[0];
  if (pts.length >= 3 && inside(cen)) return cen;
  for (let i = 0; i < pts.length; i++) for (let j = i + 2; j < pts.length; j++) { const m = { x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 }; if (inside(m)) return m; }
  return pts[0];
}
/** Douglas-Peucker on a closed ring: removes wiggles smaller than `tol` mm (curved lot lines become a few straight ones). */
function dp(p: Pt[], tol: number): Pt[] {
  if (p.length < 3) return p;
  let idx = 0, md = 0; const a = p[0], b = p[p.length - 1];
  for (let i = 1; i < p.length - 1; i++) { const d = segDist(p[i], a, b); if (d > md) { md = d; idx = i; } }
  if (md <= tol) return [a, b];
  const l = dp(p.slice(0, idx + 1), tol), r = dp(p.slice(idx), tol); return [...l.slice(0, -1), ...r];
}

/** 4235023010 -> 4235-023-010 (the format on the tax bill). */
export const fmtApn = (s: string) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}` : String(s ?? '').trim(); };

type Feat = { attributes?: Record<string, unknown>; geometry?: { rings?: number[][][] } };
type Cand = { address: string; score: number; location: { x: number; y: number } };
/** One request with its own time limit. A user Cancel rethrows as AbortError; a slow layer becomes a plain failure. */
async function getJson(fetchFn: FetchLike, url: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<{ features?: Feat[]; candidates?: Cand[]; error?: unknown }> {
  const ctl = new AbortController(); const stop = () => ctl.abort(); signal?.addEventListener('abort', stop);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, timeoutMs); });
  try {
    const r = await Promise.race([fetchFn(url, { signal: ctl.signal }), late]);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await Promise.race([r.json(), late]) as { error?: unknown };
    if (!j || typeof j !== 'object' || j.error) throw new Error('service error');
    return j as never;
  } catch (e) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if ((e as Error)?.name === 'AbortError') throw new Error('timeout');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
}

export interface LookupOpts { fetch?: FetchLike; signal?: AbortSignal; online?: boolean; now?: Date; /** Per request, default 20 s (ZIMAS layers often take 8-10 s). */ timeoutMs?: number }
const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';
const ringOk = (r: unknown): r is number[][] => Array.isArray(r) && r.length >= 4 && r.every(pt => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
const ringArea = (r: number[][]) => Math.abs(signedArea(r.map(p => ({ x: p[0], y: p[1] }))));
const bigRing = (f?: Feat) => (f?.geometry?.rings ?? []).filter(ringOk).sort((a, b) => ringArea(b) - ringArea(a))[0];

/** Ask the city's maps about one address. Each layer can fail on its own; the rest still fill in. */
export async function lookupParcel(address: string, opts: LookupOpts = {}): Promise<ParcelOutcome> {
  const fetchFn = opts.fetch ?? ((u, i) => fetch(u, { signal: i?.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
  const T = opts.timeoutMs ?? 20000;
  if (opts.online === false) return { ok: false, error: 'offline' };
  const { street, zip } = splitAddress(address);
  if (!/\d/.test(street) || street.length < 5) return { ok: false, error: 'empty' };
  // r4juris-01: the city locator only knows LA City streets, so "2400 Main St, Santa Monica" would match LA's own Main St.
  const place = typedPlace(address); if (NOT_LA.has(place)) return { ok: false, error: 'city-mismatch', detail: place.replace(/\b\w/g, ch => ch.toUpperCase()) };
  const locate = async (st: string) => (await getJson(fetchFn, geocodeUrl(st, zip), opts.signal, T)).candidates ?? [];
  const good = (cs: Cand[], min: number) => cs.filter(c => c && Number.isFinite(c.score) && c.score >= min && c.location && Number.isFinite(c.location.x) && Number.isFinite(c.location.y) && typeof c.address === 'string');
  let all: Cand[];
  try {
    all = await locate(street);
    if (!good(all, 85).length) { const al = ALIASES.find(([re]) => re.test(street)); if (al) { const st2 = street.replace(al[0], al[1]); const more = await locate(st2); if (good(more, 85).length) all = more; } }
  } catch (e) { if (isAbort(e)) throw e; return { ok: false, error: 'network', detail: String((e as Error)?.message ?? e) }; }
  let cands = good(all, 85);
  if (!cands.length) { const near = good(all, 70)[0]; return { ok: false, error: 'not-found', ...(near ? { detail: near.address } : {}) }; }
  // A typed N/S/E/W must match: "1232 W 52nd St" and "1232 E 52ND ST" are different houses miles apart.
  const td = streetDir(street);
  if (td) { const same = cands.filter(c => { const cd = streetDir(c.address); return !cd || cd === td; }); if (!same.length) return { ok: false, error: 'direction-mismatch', detail: cands[0].address }; cands = same; }
  // r4juris-02: a typed street type must match too ("Manchester Blvd" is not "MANCHESTER AVE").
  const tt = streetType(street);
  if (tt) { const same = cands.filter(c => { const ct = streetType(c.address); return !ct || ct === tt; }); if (!same.length) return { ok: false, error: 'suffix-mismatch', detail: cands[0].address }; cands = same; }
  const c = cands[0]; const cz = c.address.match(/\b(9\d{4})\b/)?.[1] ?? '';
  if (zip && cz && cz !== zip) return { ok: false, error: 'zip-mismatch', detail: c.address };
  const failed: SourceKey[] = [];
  // The locator puts the point on the street centerline, so look 40 m around it and keep the parcel whose site address
  // has the same house number and street name. Never guess a neighbor: no exact match means no lot shape.
  let near: Feat[] | null = null;
  try { near = (await getJson(fetchFn, pointQueryUrl(PARCEL_SOURCES.parcel.url, c.location.x, c.location.y, true, 40), opts.signal, T)).features ?? []; }
  catch (e) { if (isAbort(e)) throw e; failed.push('parcel'); }
  const want = houseKey(c.address);
  const mine = (near ?? []).filter(f => want && houseKey(String(f.attributes?.TOOLTIP ?? '').split('\\n')[0]) === want);
  const apns = [...new Set(mine.map(f => String(f.attributes?.BPP ?? '')))];
  const pf = apns.length === 1 ? mine[0] : undefined;
  // Only a 10-digit BPP is a real APN. "5143BRKDWN" / "4286025BRK" are condo breakdown parcels: the unit APN is on the tax bill.
  const condo = !!pf && !/^\d{10}$/.test(apns[0].trim());
  const pieces = pf ? (near ?? []).filter(f => String(f.attributes?.BPP ?? '') === apns[0]).length : 0;
  let lot: Poly | null = null; let probe = c.location; let multiPiece = false; let frame: LotFrame | null = null; let lotRing: number[][] | undefined;
  if (pf && pieces === 1) {
    lotRing = bigRing(pf);
    if (lotRing) {
      probe = interiorPoint(lotRing);
      if (!condo) { const nbs = (near ?? []).filter(f => f !== pf).map(bigRing).filter((r): r is number[][] => !!r);
        frame = lotFrame(lotRing, c.location, nbs); const l = frame.lot;
        if (l.length >= 3 && l.every(p => Math.abs(p.x) <= MAX_LEN_MM && Math.abs(p.y) <= MAX_LEN_MM)) lot = l; else { failed.push('parcel'); frame = null; } }
    }
  } else if (pf) { multiPiece = true; probe = interiorPoint(pf.geometry?.rings?.[0] ?? [[c.location.x, c.location.y]]); }
  const noExactParcel = !!near && !pf;
  // The layer answered but no parcel has this house number (the geocoder interpolated it): a no-match, not a failure.
  const noParcelMatch = noExactParcel && apns.length === 0;
  const onLot = !!pf;
  const { x, y } = probe;
  // With a lot outline, ask about the whole lot (a lot can straddle two zones); otherwise at one point inside it.
  const area = lotRing ? queryRing(shrinkRing(lotRing, probe)) : null;
  const one = async (k: SourceKey, geom: boolean, poly: boolean) => (await getJson(fetchFn, poly && area ? polygonQueryUrl(PARCEL_SOURCES[k].url, area, geom) : pointQueryUrl(PARCEL_SOURCES[k].url, x, y, geom), opts.signal, T)).features ?? [];
  // Polygon first; if that request fails, the one-point question still answers (never worse than before).
  const ask = async (k: SourceKey, geom = false): Promise<Feat[] | null> => { try { return await one(k, geom, true); } catch (e) { if (isAbort(e)) throw e;
    if (area && (e as Error)?.message !== 'timeout') { try { return await one(k, geom, false); } catch (e2) { if (isAbort(e2)) throw e2; } } failed.push(k); return null; } };
  const [city, adjacent, zoning, zoning1a, hillside, vhfhsz, hpoz, cd, cs, cc, pal, blds] = await Promise.all([
    ask('city'), ask('adjacent'), ask('zoning'), ask('zoning1a'), ask('hillside'), ask('vhfhsz'), ask('hpoz'), ask('coastalDual'), ask('coastalSingle'), ask('coastalCommission'), ask('palisades'),
    frame ? ask('buildings', true) : Promise.resolve(null)]);
  // Overlays are only trusted at a point inside the lot (a street centerline can sit on a zone edge).
  const tri = (f: Feat[] | null): Tri3 => (f == null || !onLot ? 'unknown' : f.length ? 'yes' : 'no');
  const coastal: Tri3 = !onLot ? 'unknown' : [cd, cs, cc].some(f => f && f.length) ? 'yes' : [cd, cs, cc].every(f => f != null) ? 'no' : 'unknown';
  const attr = (pf?.attributes ?? {}) as Record<string, string>;
  const zones = (fs: Feat[] | null) => [...new Set((fs ?? []).map(f => String((f.attributes as Record<string, string> | undefined)?.ZONE_CMPLT ?? '').trim()).filter(Boolean))];
  const z02 = onLot ? zones(zoning) : [], z1a = onLot ? zones(zoning1a) : [];
  const chapter1a = !z02.length && z1a.length > 0; const zl = z02.length ? z02 : z1a;
  // Layer 1101 failing only matters when 1102 had nothing: Downtown would then look like "no zone".
  const fin = [...new Set(failed)].filter(k => k !== 'zoning1a' || (!z02.length && zoning != null));
  if (zoning == null && zoning1a != null && z1a.length) fin.splice(fin.indexOf('zoning'), 1);
  const inCity = city == null ? null : city.length > 0;
  const otherCity = String((adjacent?.[0]?.attributes as Record<string, string> | undefined)?.CITYNAME ?? '').trim();
  // r4juris-03: outside LA City and not inside any neighboring city (both layers answered) is unincorporated LA County.
  const county = inCity === false && adjacent != null && !otherCity;
  const jurisdiction = inCity === true ? 'la-city' : county ? 'la-county' : inCity === false ? 'other' : 'unknown';
  const w = lot ? Math.hypot(lot[1].x - lot[0].x, lot[1].y - lot[0].y) : null; const d = lot ? Math.max(...lot.map(p => p.y)) : null;
  // Building outlines whose middle is on this lot, largest first (house, then garage).
  const bl: { poly: Poly; a: number }[] = [];
  const pin = (poly: Poly, pt: Pt) => { let c2 = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A = poly[i], B = poly[j]; if ((A.y > pt.y) !== (B.y > pt.y) && pt.x < ((B.x - A.x) * (pt.y - A.y)) / (B.y - A.y) + A.x) c2 = !c2; } return c2; };
  // Keep an outline only when most of it (60%+, sampled on a 12 x 12 grid) is on this lot: neighbors' buildings are left out.
  const share = (poly: Poly) => { const xs = poly.map(q2 => q2.x), ys = poly.map(q2 => q2.y); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); let n = 0, k = 0;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const pt = { x: x0 + (x1 - x0) * (i + 0.5) / 12, y: y0 + (y1 - y0) * (j + 0.5) / 12 }; if (pin(poly, pt)) { n++; if (lot && pin(lot, pt)) k++; } } return n ? k / n : 0; };
  if (frame && lot && blds) for (const f of blds.slice(0, 20)) { const r = bigRing(f); if (!r) continue; const poly = simplifyRing(r.map(c2 => frame!.toLot(c2[0], c2[1])));
    if (poly.length < 3 || Math.abs(signedArea(poly)) < 9e6 /* under ~100 sq ft */) continue;
    if (share(poly) >= 0.6 && Math.abs(signedArea(poly)) <= 0.85 * Math.abs(signedArea(lot))) bl.push({ poly: signedArea(poly) < 0 ? poly.reverse() : poly, a: Math.abs(signedArea(poly)) }); }
  bl.sort((p1, p2) => p2.a - p1.a);
  return { ok: true, fill: {
    matched: String(c.address ?? '').slice(0, 120), zip: cz, at: (opts.now ?? new Date()).toISOString(), lot, widthMm: w, depthMm: d,
    apn: condo ? '' : fmtApn(attr.BPP ?? '').slice(0, 40), zone: zl.map(z => z.slice(0, 40)).join(" / ").slice(0, 64), jurisdiction, cityName: (inCity ? 'Los Angeles' : county ? 'Unincorporated LA County' : otherCity).slice(0, 60),
    flags: { hillside: tri(hillside), vhfhsz: tri(vhfhsz), coastal, hpoz: tri(hpoz) }, failed: fin, zimasPin: String(attr.PIND ?? '').slice(0, 40), multiPiece,
    northDeg: frame && lot ? frame.northDeg : null, condo, chapter1a, splitZone: zl.length > 1, noExactParcel, noParcelMatch,
    buildings: bl.map(b2 => b2.poly), palisades: tri(pal),
  } };
}
