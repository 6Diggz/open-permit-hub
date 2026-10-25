import type { Project } from '../core/model';
import type { Poly } from '../core/geom';
import { MM_PER_IN, fmtFtIn } from '../core/units';
import { bbox, clearanceToEdge, gap } from '../core/geom';
import { PACK_ID } from '../rules/pack';
import { cleanfix } from './wasm';
import { roomAbs, roomArea, roomSize, wallPoint } from '../core/rooms';
import { fmtSqFt } from '../core/units';
import { cloudPts } from '../core/cad';

const IN = (mm: number) => +(mm / MM_PER_IN).toFixed(4);
const pt = (q: { x: number; y: number }) => [IN(q.x), IN(q.y)];
/** Street name from the address line ("1234 W 52nd St, Los Angeles" -> "W 52nd St"). */
export const streetName = (address: string) => (address.split(',')[0] ?? '').replace(/^\s*\d+[A-Za-z]?\s+/, '').trim();

export interface SitePlanSpec { outlines: { layer: string; pts: number[][]; closed?: boolean }[]; dims: { layer: string; a: number[]; b: number[]; offset: number; text?: string; rot?: number; da?: number[]; db?: number[] }[]; texts: { layer: string; x: number; y: number; h: number; text: string; rot?: number }[];
  /** Circles and arcs (angles in radians, counter-clockwise). */ circles?: { layer: string; c: number[]; r: number; a0?: number; a1?: number }[]; /** Drafter's own layers: name, color index. */ layers?: [string, number][] }

/** The drafter's own entities (Pro workspace) in the CAD file: lines, polylines, circles, arcs, text, leaders, clouds, dimensions. */
export function addCad(p: Project, s: SitePlanSpec) {
  const cad = p.cad; if (!cad?.ents.length && !cad?.layers.length) return;
  s.layers = (cad?.layers ?? []).map(l => [l.name, l.color]); s.circles = [];
  for (const e of cad?.ents ?? []) {
    if (e.t === 'line' || e.t === 'pline') s.outlines.push({ layer: e.layer, pts: e.pts.map(pt), closed: e.t === 'pline' && !!e.closed });
    else if (e.t === 'cloud') s.outlines.push({ layer: e.layer, pts: cloudPts(e.pts, 304.8).map(pt), closed: true });
    else if (e.t === 'circle' || e.t === 'arc') s.circles.push({ layer: e.layer, c: pt(e.pts[0]), r: IN(e.r ?? 0), ...(e.t === 'arc' ? { a0: e.a0 ?? 0, a1: e.a1 ?? 0 } : {}) });
    else if (e.t === 'text') (e.text ?? '').split('\n').forEach((line, i) => s.texts.push({ layer: e.layer, x: IN(e.pts[0].x), y: IN(e.pts[0].y - (e.h ?? 150) * 1.45 * i), h: IN(e.h ?? 150), text: line, rot: e.rot ?? 0 }));
    else if (e.t === 'leader') { s.outlines.push({ layer: e.layer, pts: e.pts.map(pt), closed: false }); const q = e.pts[e.pts.length - 1]; s.texts.push({ layer: e.layer, x: IN(q.x) + IN(e.h ?? 150) * 1.3, y: IN(q.y) - IN(e.h ?? 150) / 2, h: IN(e.h ?? 150), text: e.text ?? '' }); }
    else if (e.t === 'dim') { const [a, b] = e.pts; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if (e.rot != null) { const u = { x: Math.cos(e.rot), y: Math.sin(e.rot) }, n = { x: -u.y, y: u.x }; const off = e.off ?? 0; const A = { x: a.x + n.x * off, y: a.y + n.y * off }; const t = (b.x - a.x) * u.x + (b.y - a.y) * u.y; const B = { x: A.x + u.x * t, y: A.y + u.y * t };
        s.dims.push({ layer: e.layer, a: pt(a), b: pt(b), offset: IN(off), rot: e.rot, da: pt(A), db: pt(B), ...(e.text ? { text: e.text } : {}) }); }
      else s.dims.push({ layer: e.layer, a: pt(a), b: pt(b), offset: IN(e.off ?? 0), ...(e.text ? { text: e.text } : {}) }); void L; }
  }
}

/** Everything the CAD file shows, in inches (the file's declared unit). One builder for the DXF 2018 and the R12 fallback. */
export function sitePlanSpec(p: Project): SitePlanSpec {
  if (p.site.lot.length < 3) throw new Error('The lot has no shape yet. Enter the lot size first.');
  const lot = p.site.lot, fp = p.adu.footprint; const s: SitePlanSpec = { outlines: [], dims: [], texts: [] };
  s.outlines.push({ layer: 'C-PROP', pts: lot.map(pt) }, { layer: 'A-BLDG-EXST', pts: p.site.primary.map(pt) }, { layer: p.adu.mode === 'conversion' ? 'A-WALL-EXST' : 'A-WALL', pts: fp.map(pt) });
  // Lot line lengths
  lot.forEach((a, i) => { const b = lot[(i + 1) % lot.length]; s.dims.push({ layer: 'A-ANNO-DIMS', a: pt(a), b: pt(b), offset: -36 }); });
  // Setbacks: ADU to each side/rear line, as a dimension from the closest ADU corner square to the line
  lot.forEach((a, i) => {
    if (i === p.site.streetEdge) return; const b = lot[(i + 1) % lot.length]; const d = clearanceToEdge(fp, lot, i); if (!Number.isFinite(d) || d <= 0) return;
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (!L) return; const nx = -dy / L, ny = dx / L;
    const c = fp.reduce((m, q) => (Math.abs((q.x - a.x) * nx + (q.y - a.y) * ny) < Math.abs((m.x - a.x) * nx + (m.y - a.y) * ny) ? q : m), fp[0]);
    const proj = { x: c.x - nx * ((c.x - a.x) * nx + (c.y - a.y) * ny), y: c.y - ny * ((c.x - a.x) * nx + (c.y - a.y) * ny) };
    s.dims.push({ layer: 'C-PROP-SBCK', a: pt(c), b: pt(proj), offset: 18, text: `<> SETBACK` });
  });
  // Building separation ADU to house
  const g = gap(fp, p.site.primary);
  if (g > 0 && Number.isFinite(g)) {
    const hb = bbox(p.site.primary), ab = bbox(fp); const x = (Math.max(hb.minX, ab.minX) + Math.min(hb.maxX, ab.maxX)) / 2;
    const [y1, y2] = hb.maxY <= ab.minY ? [hb.maxY, ab.minY] : ab.maxY <= hb.minY ? [ab.maxY, hb.minY] : [NaN, NaN];
    if (Number.isFinite(y1) && x >= Math.max(hb.minX, ab.minX)) s.dims.push({ layer: 'A-ANNO-DIMS', a: pt({ x, y: y1 }), b: pt({ x, y: y2 }), offset: 24, text: '<> BUILDING SEPARATION' });
  }
  // Rooms (A-AREA outlines, A-AREA-IDEN names/sizes), doors (A-DOOR) and windows (A-GLAZ) as thin closed outlines in the wall.
  for (const r of p.adu.rooms) {
    const abs = roomAbs(p, r); s.outlines.push({ layer: 'A-AREA', pts: abs.map(pt) }); const rb = bbox(abs); const z = roomSize(r);
    s.texts.push({ layer: 'A-AREA-IDEN', x: IN((rb.minX + rb.maxX) / 2) - 24, y: IN((rb.minY + rb.maxY) / 2) + 6, h: 6, text: (r.name || 'ROOM').toUpperCase() });
    s.texts.push({ layer: 'A-AREA-IDEN', x: IN((rb.minX + rb.maxX) / 2) - 24, y: IN((rb.minY + rb.maxY) / 2) - 4, h: 4, text: `${fmtFtIn(z.w)} x ${fmtFtIn(z.d)}  ${fmtSqFt(roomArea(r))}${z.taped ? ' (TAPE)' : ''}` });
    for (const o of r.openings) { const w = wallPoint(abs, o.wall, o.offsetMm); const e = { x: w.x + w.ux * o.widthMm, y: w.y + w.uy * o.widthMm }; const t = 40, nx = -w.uy * t, ny = w.ux * t;
      s.outlines.push({ layer: o.kind === 'door' ? 'A-DOOR' : 'A-GLAZ', pts: [w, e, { x: e.x + nx, y: e.y + ny }, { x: w.x + nx, y: w.y + ny }].map(pt) }); }
  }
  // Review pins (G-ANNO-REDL): "[n] comment" at the pin.
  for (const x of p.markup.pins) s.texts.push({ layer: 'G-ANNO-REDL', x: IN(x.x), y: IN(x.y), h: 8, text: `[${x.n}${x.status === 'resolved' ? ' RESOLVED' : ''}] ${x.comment}`.slice(0, 250) });
  // North arrow (closed arrow outline + "N"), turned to true north: degrees clockwise from the drawing's +Y.
  { const lb = bbox(lot); const cx = IN(lb.maxX) + 72, cy = IN(lb.maxY) - 48, r = 30, an = ((p.site.northDeg ?? 0) * Math.PI) / 180;
    const ux = Math.sin(an), uy = Math.cos(an), hx = -uy, hy = ux; const P = (f: number, g: number) => [+(cx + ux * f + hx * g).toFixed(4), +(cy + uy * f + hy * g).toFixed(4)];
    s.outlines.push({ layer: 'A-ANNO-TEXT', pts: [P(r, 0), P(-r, 10), P(-r * 0.55, 0), P(-r, -10)] });
    const t = P(r + 14, 0); s.texts.push({ layer: 'A-ANNO-TEXT', x: t[0] - 4, y: t[1] - 4, h: 10, text: 'N' });
    if (p.site.northDeg == null) s.texts.push({ layer: 'A-ANNO-TEXT', x: cx - 40, y: cy - r - 20, h: 6, text: 'NORTH NOT SET - CHECK BEFORE SUBMITTAL' }); }
  const se = p.site.streetEdge, a = lot[se], b = lot[(se + 1) % lot.length];
  const street = streetName(p.site.address);
  s.texts.push({ layer: 'A-ANNO-TEXT', x: IN((a.x + b.x) / 2) - 60, y: IN((a.y + b.y) / 2) - 90, h: 14, text: street ? `STREET: ${street.toUpperCase()}` : 'STREET' });
  const lab = (pl: Poly, t: string) => { const bb = bbox(pl); s.texts.push({ layer: 'A-ANNO-TEXT', x: IN((bb.minX + bb.maxX) / 2) - t.length * 3, y: IN((bb.minY + bb.maxY) / 2), h: 10, text: t }); };
  lab(p.site.primary, 'EXISTING HOUSE'); lab(fp, p.adu.mode === 'conversion' ? 'GARAGE CONVERSION (ADU)' : 'ADU');
  s.texts.push({ layer: 'A-ANNO-TEXT', x: IN(lot[0].x), y: IN(lot[0].y) - 150, h: 10, text: `${p.site.address || 'Address'}  APN ${p.site.apn || '-'}${p.site.zone ? '  ZONE ' + p.site.zone : ''}  UNITS: INCHES  ${PACK_ID}  DRAFT - verify all dimensions` });
  s.texts.push({ layer: 'A-ANNO-TEXT', x: IN(lot[0].x), y: IN(lot[0].y) - 172, h: 8, text: `Prepared by ${p.people.preparerName || '-'} (${p.people.preparerRole})${p.people.preparerLicense ? ' Lic. ' + p.people.preparerLicense : ''}. Made with Open Permit Hub software; the software is not the preparer.` });
  return s;
}

/** DXF 2018 with $INSUNITS = inches, closed LWPOLYLINEs and real DIMENSION entities (built by the WASM CAD writer). */
export async function toDXF(p: Project): Promise<Uint8Array> {
  const spec = sitePlanSpec(p); addCad(p, spec);
  try { const m = await cleanfix(); return m.site_plan_dxf(JSON.stringify(spec)); }
  catch { return new TextEncoder().encode(toDXFR12(p)); }
}

/** Non-ASCII letters as DXF \U+XXXX escapes (accents survive instead of turning into "?"). */
export const dxfText = (s: string) => s.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7E]/gu, c => { const cp = c.codePointAt(0)!; return cp <= 0xFFFF ? `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : '?'; });

/** AutoCAD R12 ASCII DXF fallback (laser/CNC tools, or when the WASM writer can't load). Units noted in text. */
export function toDXFR12(p: Project): string {
  const spec = sitePlanSpec(p); addCad(p, spec);
  const o: string[] = []; const w = (c: number, v: string | number) => o.push(String(c), String(v));
  const base: [string, number][] = [['C-PROP', 7], ['A-BLDG-EXST', 8], ['A-WALL', 1], ['A-WALL-EXST', 8], ['C-PROP-SBCK', 3], ['A-ANNO-DIMS', 5], ['A-ANNO-TEXT', 7], ['A-AREA', 4], ['A-AREA-IDEN', 4], ['A-DOOR', 2], ['A-GLAZ', 5], ['G-ANNO-REDL', 1]];
  const used = new Set([...spec.outlines.map(x => x.layer), ...spec.texts.map(x => x.layer), ...spec.dims.map(x => x.layer), ...(spec.circles ?? []).map(x => x.layer)]);
  const layers: [string, number][] = [...base, ...(spec.layers ?? []).filter(([n]) => !base.some(b => b[0] === n)), ...[...used].filter(n => !base.some(b => b[0] === n) && !(spec.layers ?? []).some(l => l[0] === n)).map(n => [n, 7] as [string, number])];
  w(0, 'SECTION'); w(2, 'HEADER'); w(9, '$ACADVER'); w(1, 'AC1009'); w(9, '$INSBASE'); w(10, 0); w(20, 0); w(30, 0); w(0, 'ENDSEC');
  w(0, 'SECTION'); w(2, 'TABLES'); w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.length);
  layers.forEach(([n, c]) => { w(0, 'LAYER'); w(2, n); w(70, 0); w(62, c); w(6, 'CONTINUOUS'); });
  w(0, 'ENDTAB'); w(0, 'ENDSEC'); w(0, 'SECTION'); w(2, 'ENTITIES');
  for (const c of spec.circles ?? []) { if (c.a0 == null) { w(0, 'CIRCLE'); w(8, c.layer); w(10, c.c[0]); w(20, c.c[1]); w(30, 0); w(40, c.r); } else { w(0, 'ARC'); w(8, c.layer); w(10, c.c[0]); w(20, c.c[1]); w(30, 0); w(40, c.r); w(50, (c.a0 * 180 / Math.PI).toFixed(6)); w(51, ((c.a1 ?? 0) * 180 / Math.PI).toFixed(6)); } }
  for (const ol of spec.outlines) { w(0, 'POLYLINE'); w(8, ol.layer); w(66, 1); w(70, ol.closed === false ? 0 : 1); for (const q of ol.pts) { w(0, 'VERTEX'); w(8, ol.layer); w(10, q[0]); w(20, q[1]); w(30, 0); } w(0, 'SEQEND'); w(8, ol.layer); }
  const text = (x: number, y: number, h: number, s: string, layer: string, rot = 0) => { w(0, 'TEXT'); w(8, layer); w(10, x.toFixed(4)); w(20, y.toFixed(4)); w(30, 0); w(40, h.toFixed(2)); w(1, dxfText(s)); if (rot) w(50, (rot * 180 / Math.PI).toFixed(4)); };
  for (const d of spec.dims) { const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) * MM_PER_IN; text((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2 + d.offset / 3, 8, (d.text ?? '<>').replace('<>', fmtFtIn(L)), d.layer); }
  for (const t of spec.texts) text(t.x, t.y, t.h, t.text, t.layer, t.rot);
  w(0, 'ENDSEC'); w(0, 'EOF');
  return o.join('\r\n');
}
