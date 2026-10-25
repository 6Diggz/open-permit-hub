// Parcel autofill from free official City of Los Angeles map services (opt-in; nothing is sent until the user taps "Look up").
// Every source below was opened and tested for browser access (CORS) on 2026-10-25.
// This file has no runtime imports so the fixture recorder (scripts/record-parcel.mjs) can load it directly in Node.
import type { Poly, Pt } from '../core/geom';
import { MAX_LEN_MM } from '../core/units';

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
  hillside: { name: 'Hillside Ordinance area (GeoHub)', url: `${LAHUB}/Special_Areas/MapServer/6` },
  vhfhsz: { name: 'Very High Fire Hazard Severity Zones (GeoHub)', url: `${LAHUB}/Special_Areas/MapServer/11` },
  hpoz: { name: 'Historic Preservation Overlay Zones (GeoHub)', url: `${LAHUB}/City_Planning_Department/MapServer/10` },
  coastalDual: { name: 'Coastal Zone, dual permit area (ZIMAS)', url: `${ZIMAS}/zma/coastal_zones/MapServer/1603` },
  coastalSingle: { name: 'Coastal Zone, single permit area (ZIMAS)', url: `${ZIMAS}/zma/coastal_zones/MapServer/1604` },
  coastalCommission: { name: 'Coastal Commission permit area (ZIMAS)', url: `${ZIMAS}/zma/coastal_zones/MapServer/1605` },
} as const;
export type SourceKey = keyof typeof PARCEL_SOURCES;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export type Tri3 = 'yes' | 'no' | 'unknown';

export interface ParcelFill {
  matched: string; zip: string; at: string;
  /** Lot outline in the local frame (mm, street edge first, lot above it), or null if the parcel layer failed. */
  lot: Poly | null; widthMm: number | null; depthMm: number | null;
  /** The street was found but no parcel carries this house number. */ noParcelMatch?: boolean;
  apn: string; zone: string; jurisdiction: 'la-city' | 'other' | 'unknown'; cityName: string;
  flags: { hillside: Tri3; vhfhsz: Tri3; coastal: Tri3; hpoz: Tri3 };
  /** Sources that did not answer (their fields stay as they were). */
  failed: SourceKey[];
  zimasPin: string;
  /** The APN is made of several mapped pieces: the APN is filled, the lot shape is left to the user. */
  multiPiece: boolean;
}
export type ParcelError = 'offline' | 'empty' | 'not-found' | 'zip-mismatch' | 'network' | 'no-parcel';
export type ParcelOutcome = { ok: true; fill: ParcelFill } | { ok: false; error: ParcelError; detail?: string };

/** "1234 W 52nd St, Los Angeles, CA 90037" -> street "1234 W 52nd St", zip "90037". */
export function splitAddress(raw: string): { street: string; zip: string } {
  const s = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const zip = s.match(/\b(9\d{4})(?:-\d{4})?\s*$/)?.[1] ?? '';
  const street = (s.split(',')[0] ?? '').replace(/\b9\d{4}(?:-\d{4})?\s*$/, '').replace(/#.*$|\b(apt|unit|ste|suite)\b.*$/i, '').trim();
  return { street, zip };
}

const q = (o: Record<string, string | number>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
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
    const s1 = dp(p.slice(0, far + 1), 50), s2 = dp([...p.slice(far), p[0]], 50); const r = [...s1.slice(0, -1), ...s2.slice(0, -1)]; if (r.length >= 3) p = r; }
  return p;
}

/**
 * Lon/lat ring -> local lot frame in mm: counter-clockwise, the street edge (the edge closest to the address point) is edge 0
 * and runs along +x at the bottom, the lot lies above it, and the lowest-left corner is near the origin. Never State Plane (UU008).
 */
export function ringToLot(ring: number[][], street: { x: number; y: number }): Poly {
  const lat0 = ring.reduce((s, c) => s + c[1], 0) / ring.length, lon0 = ring.reduce((s, c) => s + c[0], 0) / ring.length; const m = mPerDeg(lat0);
  const toLocal = (lon: number, lat: number): Pt => ({ x: (lon - lon0) * m.lon * 1000, y: (lat - lat0) * m.lat * 1000 });
  let p = simplifyRing(ring.map(c => toLocal(c[0], c[1])));
  if (signedArea(p) < 0) p.reverse();
  const s = toLocal(street.x, street.y);
  // Street edge: the edge whose middle is closest to the street point (the locator slides the point along the street,
  // so the nearest edge END can be a side line; the nearest MIDDLE is the frontage). Corner lots: the user can change it.
  let best = 0, bd = Infinity; p.forEach((a, i) => { const b = p[(i + 1) % p.length]; const d = Math.hypot(s.x - (a.x + b.x) / 2, s.y - (a.y + b.y) / 2) + segDist(s, a, b) * 0.5; if (d < bd) { bd = d; best = i; } });
  p = [...p.slice(best), ...p.slice(0, best)];
  const a = p[0], b = p[1], th = Math.atan2(b.y - a.y, b.x - a.x), cs = Math.cos(-th), sn = Math.sin(-th);
  p = p.map(q2 => ({ x: (q2.x - a.x) * cs - (q2.y - a.y) * sn, y: (q2.x - a.x) * sn + (q2.y - a.y) * cs }));
  const minX = Math.min(...p.map(q2 => q2.x)), minY = Math.min(...p.map(q2 => q2.y));
  return p.map(q2 => ({ x: Math.round((q2.x - minX) * 10) / 10, y: Math.round((q2.y - minY) * 10) / 10 }));
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
async function getJson(fetchFn: FetchLike, url: string, signal?: AbortSignal): Promise<{ features?: Feat[]; candidates?: { address: string; score: number; location: { x: number; y: number } }[]; error?: unknown }> {
  const r = await fetchFn(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json() as { error?: unknown };
  if (!j || typeof j !== 'object' || j.error) throw new Error('service error');
  return j as never;
}

export interface LookupOpts { fetch?: FetchLike; signal?: AbortSignal; online?: boolean; now?: Date }

/** Ask the city's maps about one address. Each layer can fail on its own; the rest still fill in. */
export async function lookupParcel(address: string, opts: LookupOpts = {}): Promise<ParcelOutcome> {
  const fetchFn = opts.fetch ?? ((u, i) => fetch(u, { signal: i?.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
  if (opts.online === false) return { ok: false, error: 'offline' };
  const { street, zip } = splitAddress(address);
  if (!/\d/.test(street) || street.length < 5) return { ok: false, error: 'empty' };
  let g;
  try { g = await getJson(fetchFn, geocodeUrl(street, zip), opts.signal); } catch (e) { if ((e as Error)?.name === 'AbortError') throw e; return { ok: false, error: 'network', detail: String((e as Error)?.message ?? e) }; }
  const cands = (g.candidates ?? []).filter(c => c && Number.isFinite(c.score) && c.score >= 85 && c.location && Number.isFinite(c.location.x) && Number.isFinite(c.location.y));
  if (!cands.length) return { ok: false, error: 'not-found' };
  const c = cands[0]; const cz = c.address.match(/\b(9\d{4})\b/)?.[1] ?? '';
  if (zip && cz && cz !== zip) return { ok: false, error: 'zip-mismatch', detail: c.address };
  const failed: SourceKey[] = [];
  // The locator puts the point on the street centerline, so look 40 m around it and keep the parcel whose site address
  // has the same house number and street name. Never guess a neighbor: no exact match means no lot shape.
  let near: Feat[] | null = null;
  try { near = (await getJson(fetchFn, pointQueryUrl(PARCEL_SOURCES.parcel.url, c.location.x, c.location.y, true, 40), opts.signal)).features ?? []; }
  catch (e) { if ((e as Error)?.name === 'AbortError') throw e; failed.push('parcel'); }
  const want = houseKey(c.address);
  const mine = (near ?? []).filter(f => want && houseKey(String(f.attributes?.TOOLTIP ?? '').split('\\n')[0]) === want);
  const apns = [...new Set(mine.map(f => String(f.attributes?.BPP ?? '')))];
  const pf = apns.length === 1 ? mine[0] : undefined;
  const pieces = pf ? (near ?? []).filter(f => String(f.attributes?.BPP ?? '') === apns[0]).length : 0;
  let lot: Poly | null = null; let probe = c.location; let multiPiece = false;
  if (pf && pieces === 1) {
    const rings = (pf.geometry?.rings ?? []).filter(r => Array.isArray(r) && r.length >= 4 && r.every(pt => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])));
    const ring = rings.sort((a, b) => Math.abs(signedArea(b.map(p => ({ x: p[0], y: p[1] })))) - Math.abs(signedArea(a.map(p => ({ x: p[0], y: p[1] })))))[0];
    if (ring) { const l = ringToLot(ring, c.location); if (l.length >= 3 && l.every(p => Math.abs(p.x) <= MAX_LEN_MM && Math.abs(p.y) <= MAX_LEN_MM)) lot = l; else failed.push('parcel'); probe = interiorPoint(ring); }
  } else if (pf) { multiPiece = true; probe = interiorPoint(pf.geometry?.rings?.[0] ?? [[c.location.x, c.location.y]]); }
  // The layer answered but no parcel has this house number (the geocoder interpolated it): a no-match, not a failure.
  const noParcelMatch = !!near && !pf && apns.length === 0;
  if (near && !pf && !noParcelMatch) failed.push('parcel');
  const onLot = !!pf;
  const { x, y } = probe;
  const ask = async (k: SourceKey): Promise<Feat[] | null> => { try { return (await getJson(fetchFn, pointQueryUrl(PARCEL_SOURCES[k].url, x, y, false), opts.signal)).features ?? []; } catch (e) { if ((e as Error)?.name === 'AbortError') throw e; failed.push(k); return null; } };
  const [city, adjacent, zoning, hillside, vhfhsz, hpoz, cd, cs, cc] = await Promise.all([
    ask('city'), ask('adjacent'), ask('zoning'), ask('hillside'), ask('vhfhsz'), ask('hpoz'), ask('coastalDual'), ask('coastalSingle'), ask('coastalCommission')]);
  // Overlays are only trusted at a point inside the lot (a street centerline can sit on a zone edge).
  const tri = (f: Feat[] | null): Tri3 => (f == null || !onLot ? 'unknown' : f.length ? 'yes' : 'no');
  const coastal: Tri3 = !onLot ? 'unknown' : [cd, cs, cc].some(f => f && f.length) ? 'yes' : [cd, cs, cc].every(f => f != null) ? 'no' : 'unknown';
  const attr = (pf?.attributes ?? {}) as Record<string, string>;
  const zf = onLot ? zoning?.[0]?.attributes as Record<string, string> | undefined : undefined;
  const inCity = city == null ? null : city.length > 0;
  const otherCity = String((adjacent?.[0]?.attributes as Record<string, string> | undefined)?.CITYNAME ?? '').trim();
  const jurisdiction = inCity === true ? 'la-city' : inCity === false ? 'other' : 'unknown';
  const w = lot ? Math.hypot(lot[1].x - lot[0].x, lot[1].y - lot[0].y) : null; const d = lot ? Math.max(...lot.map(p => p.y)) : null;
  return { ok: true, fill: {
    matched: String(c.address ?? '').slice(0, 120), zip: cz, at: (opts.now ?? new Date()).toISOString(), lot, widthMm: w, depthMm: d,
    apn: fmtApn(attr.BPP ?? '').slice(0, 40), zone: String(zf?.ZONE_CMPLT ?? '').trim().slice(0, 40), jurisdiction, cityName: (inCity ? 'Los Angeles' : otherCity).slice(0, 60),
    flags: { hillside: tri(hillside), vhfhsz: tri(vhfhsz), coastal, hpoz: tri(hpoz) }, failed: [...new Set(failed)], zimasPin: String(attr.PIND ?? '').slice(0, 40), multiPiece, noParcelMatch,
  } };
}
