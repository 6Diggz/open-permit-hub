// One source for the setback facts every sheet prints: the required side/rear setback (the dashed line and its keynote),
// and the ADU's distance to each side and rear lot line (the dims and the site data). Review 3 F1: the keynote said 4'-0"
// while the site data called a 2'-0" distance a "setback", and listed SIDE twice.
import type { Project } from './model';
import { clearanceToEdge, gap } from './geom';
import { ft } from './units';

/** LADBS / state ADU minimum side and rear setback for new construction. */
export const SIDE_REAR_SETBACK_MM = ft(4);
export interface EdgeFact { i: number; kind: 'side' | 'rear'; dir: 'N' | 'E' | 'S' | 'W'; clearMm: number; short: boolean }
const DIRS = { en: { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' }, es: { N: 'NORTE', E: 'ESTE', S: 'SUR', W: 'OESTE' } } as const;

/** Each side and rear lot line with the ADU's clear distance to it. Compass side from the plan (true north when entered). */
export function edgeFacts(p: Project): EdgeFact[] {
  const lot = p.site.lot; const st = new Set([p.site.streetEdge, ...(p.site.streetEdges ?? [])]);
  const sa = lot[p.site.streetEdge], sbp = lot[(p.site.streetEdge + 1) % lot.length]; const su = { x: sbp.x - sa.x, y: sbp.y - sa.y };
  let s2 = 0; lot.forEach((a, i) => { const b = lot[(i + 1) % lot.length]; s2 += a.x * b.y - b.x * a.y; });
  const nd = ((p.site.northDeg ?? 0) * Math.PI) / 180; const out: EdgeFact[] = [];
  lot.forEach((a, i) => { if (st.has(i)) return; const b = lot[(i + 1) % lot.length]; const u = { x: b.x - a.x, y: b.y - a.y }; const L = Math.hypot(u.x, u.y) || 1;
    const cr = Math.abs(u.x * su.y - u.y * su.x) / (L * (Math.hypot(su.x, su.y) || 1));
    // outward normal, turned so north is +y
    const n = s2 >= 0 ? { x: u.y / L, y: -u.x / L } : { x: -u.y / L, y: u.x / L }; const ang = Math.atan2(n.x, n.y) - nd; const k = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
    const d = clearanceToEdge(p.adu.footprint, lot, i); if (!Number.isFinite(d)) return;
    out.push({ i, kind: cr < 0.5 ? 'rear' : 'side', dir: (['N', 'E', 'S', 'W'] as const)[k], clearMm: d, short: d < SIDE_REAR_SETBACK_MM - 0.5 }); });
  return out;
}
/** Site data rows (label, value): one required setback, then a distinct row per lot line. Labels are unique. */
export function siteFacts(p: Project, es: boolean, fmt: (mm: number) => string): [string, string][] {
  const rows: [string, string][] = [[es ? 'RETIRO REQUERIDO, LATERAL Y TRASERO' : 'REQUIRED SETBACK, SIDE AND REAR', fmt(SIDE_REAR_SETBACK_MM)]];
  const seen = new Map<string, number>();
  for (const f of edgeFacts(p)) { const base = es ? `ADU AL LINDERO ${f.kind === 'side' ? 'LATERAL' : 'TRASERO'}, ${DIRS.es[f.dir]}` : `ADU TO ${f.kind === 'side' ? 'SIDE' : 'REAR'} LOT LINE, ${DIRS.en[f.dir]}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    rows.push([n > 1 ? `${base} (${n})` : base, fmt(f.clearMm) + (f.short ? (es ? ` (MENOS DE ${fmt(SIDE_REAR_SETBACK_MM)})` : ` (UNDER ${fmt(SIDE_REAR_SETBACK_MM)})`) : '')]); }
  const g = gap(p.adu.footprint, p.site.primary); if (g > 0 && Number.isFinite(g)) rows.push([es ? 'SEPARACIÓN DE EDIFICIOS' : 'BUILDING SEPARATION', fmt(g)]);
  return rows;
}
/** The setback keynote text (same value as the dashed line and the site data). */
export const setbackKeynote = (es: boolean, fmt: (mm: number) => string) => (es ? `LÍNEA DE RETIRO DE ${fmt(SIDE_REAR_SETBACK_MM)}` : `${fmt(SIDE_REAR_SETBACK_MM)} SETBACK LINE`);
