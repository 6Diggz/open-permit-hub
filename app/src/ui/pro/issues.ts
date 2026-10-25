// Check pins for the Pro workspace, read from the shared verdict (core/verdict.ts): where each open check sits on the
// drawing, its number, and the one-click fixes that are safe to offer. Pure and unit-tested.
import type { Project } from '../../core/model';
import type { Result, Status } from '../../rules/engine';
import { bbox, clearanceToEdge, polyInside, translate, overlaps, type Pt } from '../../core/geom';
import { ft } from '../../core/units';
import { closestPair, garageDoorEdge, inward, fmtArch } from './drafting';
import { roomAbs } from '../../core/rooms';
import { fireSeparation } from '../../rules/la-city';

export type Step = 'lot' | 'garage' | 'rooms' | 'checks' | 'export' | 'review';
export interface Fix { id: string; en: string; es: string; apply: (d: Project) => void }
export interface Issue { id: string; n: number | null; status: Status; r: Result; at: Pt | null; fixes: Fix[]; step: Step }

const SPATIAL_EDGE = new Set(['SET-01', 'SET-02', 'SET-03', 'ADD-01', 'FIR-01', 'FIR-02', 'SEP-01', 'GEO-01', 'SCP-01', 'GAR-01']);
const ROOMY = new Set(['EGR-01', 'ROM-01', 'CEI-01', 'ALM-01', 'ALM-02', 'VAP-01']);
const STEP_OF: Record<string, Step> = { core: 'lot', zoning: 'garage', hazards: 'lot', fire: 'garage', structural: 'garage', fees: 'checks', egress: 'rooms', energy: 'checks', people: 'export', clocks: 'export' };

/** Side and rear lot edges (not streets). */
export const sideRearEdges = (p: Project) => { const st = new Set([p.site.streetEdge, ...(p.site.streetEdges ?? [])]); return p.site.lot.map((_, i) => i).filter(i => !st.has(i)); };

/** Move the ADU straight in from every side or rear line it is closer than `need` to. Null when that can't be done cleanly. */
export function moveClear(p: Project, need: number): Project['adu']['footprint'] | null {
  const lot = p.site.lot; let fp = p.adu.footprint; let moved = false;
  for (let pass = 0; pass < 3; pass++) for (const i of sideRearEdges(p)) { const d = clearanceToEdge(fp, lot, i); if (d < need - 0.5) { const n = inward(lot, i); fp = translate(fp, n.x * (need - d), n.y * (need - d)); moved = true; } }
  if (!moved) return null;
  if (!polyInside(fp, lot) || overlaps(fp, p.site.primary)) return null;
  if (sideRearEdges(p).some(i => clearanceToEdge(fp, lot, i) < need - 1)) return null;
  return fp.map(q => ({ x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000 }));
}

function anchor(p: Project, r: Result): Pt | null {
  const id = r.rule.id; const fp = p.adu.footprint; const fb = bbox(fp); const c = { x: (fb.minX + fb.maxX) / 2, y: (fb.minY + fb.maxY) / 2 };
  if (SPATIAL_EDGE.has(id)) {
    const lot = p.site.lot; let best: [Pt, Pt] | null = null; let bd = Infinity;
    for (const i of sideRearEdges(p)) { const pr = closestPair(fp, lot[i], lot[(i + 1) % lot.length]); const d = Math.hypot(pr[1].x - pr[0].x, pr[1].y - pr[0].y); if (d < bd) { bd = d; best = pr; } }
    if (id.startsWith('FIR')) { const fs = fireSeparation(p); if (/house|casa/.test(fs.line.en)) { const hb = bbox(p.site.primary); return { x: (Math.max(fb.minX, hb.minX) + Math.min(fb.maxX, hb.maxX)) / 2, y: (fb.minY + hb.maxY) / 2 }; } }
    return best ? { x: (best[0].x + best[1].x) / 2, y: (best[0].y + best[1].y) / 2 } : c;
  }
  if (ROOMY.has(id)) { const r0 = p.adu.rooms.find(x => x.use === 'sleeping') ?? p.adu.rooms[0]; if (r0) { const b = bbox(roomAbs(p, r0)); return { x: b.minX + (b.maxX - b.minX) * 0.25, y: b.maxY - (b.maxY - b.minY) * 0.25 }; } return { x: fb.minX + (fb.maxX - fb.minX) * 0.25, y: fb.maxY - (fb.maxY - fb.minY) * 0.25 }; }
  if (id === 'ENG-01' && p.adu.mode === 'conversion') { const e = garageDoorEdge(p); const a = fp[e], b = fp[(e + 1) % fp.length]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  if (id === 'HGT-01' || id === 'SIZ-01') return { x: fb.maxX, y: fb.maxY };
  return null;
}

function fixesFor(p: Project, r: Result): Fix[] {
  const out: Fix[] = []; const id = r.rule.id;
  if (id === 'FIR-01' && r.status !== 'PASS') {
    const fs = fireSeparation(p);
    if (/property line|lindero/.test(fs.line.en) && fs.dist < ft(5) - 0.5) { const fp = moveClear(p, ft(5)); if (fp) out.push({ id: 'move5', en: `Move ADU to ${fmtArch(ft(5))}`, es: `Mover el ADU a ${fmtArch(ft(5))}`, apply: d => { d.adu.footprint = fp; d.confirmed.adu = true; } }); }
    if (fs.dist < ft(5) - 0.5 && p.adu.ratedWallPlanned !== 'yes') out.push({ id: 'rated', en: 'Mark wall as 1-hr', es: 'Marcar muro de 1 hora', apply: d => { d.adu.ratedWallPlanned = 'yes'; } });
  }
  if (id === 'SET-02' && r.status === 'FAIL') { const fp = moveClear(p, ft(4)); if (fp) out.push({ id: 'move4', en: `Move ADU to ${fmtArch(ft(4))}`, es: `Mover el ADU a ${fmtArch(ft(4))}`, apply: d => { d.adu.footprint = fp; d.confirmed.adu = true; } }); }
  if (id === 'ENG-01' && r.status !== 'PASS' && p.adu.removesGarageDoorWall === 'unknown') out.push({ id: 'door', en: 'Garage door wall is filled in', es: 'Se rellena el muro de la puerta', apply: d => { d.adu.removesGarageDoorWall = 'yes'; } });
  return out;
}

/** Every check that is not a pass, ordered fixes first; the ones with a place on the drawing get pin numbers 1..n. */
export function issuesOf(p: Project, results: Result[]): Issue[] {
  const order: Status[] = ['FAIL', 'UNKNOWN', 'NOT_CHECKED', 'INFO'];
  const list = results.filter(r => r.status !== 'PASS').sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  let n = 0;
  return list.map(r => { const at = r.status === 'FAIL' || r.status === 'UNKNOWN' ? anchor(p, r) : null; return { id: r.rule.id, n: at ? ++n : null, status: r.status, r, at, fixes: fixesFor(p, r), step: STEP_OF[r.rule.module] ?? 'checks' }; });
}
