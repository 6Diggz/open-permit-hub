// Command engine for the Pro workspace command line. Generic drafting command names and short aliases, point input from
// clicks or typed text (x,y  @dx,dy  @dist<angle  or a plain distance along the cursor), and prompts. Pure and unit-tested.
import type { Project, Room } from '../../core/model';
import { type Pt, bbox, translate } from '../../core/geom';
import { parseLength, ft, inch } from '../../core/units';
import { type Ent, type EntType, arc3, mapEnt, moveF, rotF, mirrorF, scaleF, offsetEnt, trimLine, extendLine, LAYER_FOR, DEFAULT_CAD, MAX_ENTS } from '../../core/cad';
import { footLocal, roomFits, applyTape, MAX_ROOMS, MAX_OPENINGS } from '../../core/rooms';
import { fmtArch } from './drafting';

export interface Ctx {
  p: Project; cursor: Pt | null; sel: string[]; room: string | null; layer: string; textH: number; newId: () => string; es: boolean;
  /** What is under a point: an entity id or a room id. */ hit: (q: Pt) => { ent?: string; room?: string } | null;
}
export type Effect = { kind: 'apply'; fn: (d: Project) => void; msg?: string } | { kind: 'say'; msg: string } | { kind: 'select'; ids: string[]; room?: string | null } | { kind: 'toggle'; what: 'ortho' | 'grid' | 'snap' | 'osnap' | 'units' | 'polar' } | { kind: 'view'; what: 'fit' | 'adu' | 'markup' | 'undo' | 'redo' | 'layers' | 'help' } | { kind: 'tool'; tool: 'door' | 'window' | 'pin' };
export interface St { name: string | null; step: string; pts: Pt[]; data: Record<string, unknown> }
export interface Out { st: St; prompt: string; fx: Effect[] }
export const IDLE: St = { name: null, step: '', pts: [], data: {} };

const T = (es: boolean, en: string, sp: string) => (es ? sp : en);
/** Command names and aliases (generic drafting words). */
export const ALIASES: Record<string, string> = {
  L: 'LINE', LINE: 'LINE', PL: 'PLINE', PLINE: 'PLINE', POLYLINE: 'PLINE', REC: 'RECTANG', RECTANG: 'RECTANG', RECTANGLE: 'RECTANG', C: 'CIRCLE', CIRCLE: 'CIRCLE', A: 'ARC', ARC: 'ARC',
  T: 'TEXT', DT: 'TEXT', TEXT: 'TEXT', MT: 'MTEXT', MTEXT: 'MTEXT', LE: 'LEADER', LEADER: 'LEADER', RC: 'REVCLOUD', REVCLOUD: 'REVCLOUD',
  DLI: 'DIMLINEAR', DIMLINEAR: 'DIMLINEAR', DAL: 'DIMALIGNED', DIMALIGNED: 'DIMALIGNED', DIM: 'DIMALIGNED', DI: 'DIST', DIST: 'DIST', AA: 'AREA', AREA: 'AREA',
  M: 'MOVE', MOVE: 'MOVE', CO: 'COPY', CP: 'COPY', COPY: 'COPY', RO: 'ROTATE', ROTATE: 'ROTATE', MI: 'MIRROR', MIRROR: 'MIRROR', SC: 'SCALE', SCALE: 'SCALE',
  E: 'ERASE', ERASE: 'ERASE', DEL: 'ERASE', O: 'OFFSET', OFFSET: 'OFFSET', TR: 'TRIM', TRIM: 'TRIM', EX: 'EXTEND', EXTEND: 'EXTEND',
  RM: 'ROOM', ROOM: 'ROOM', DR: 'DOOR', DOOR: 'DOOR', WI: 'WINDOW', WINDOW: 'WINDOW', PN: 'PIN', PIN: 'PIN',
  Z: 'ZOOM', ZOOM: 'ZOOM', ZE: 'ZOOM', ZA: 'ZOOMADU', ZO: 'ZOOMADU', ZOOMADU: 'ZOOMADU', MARKUP: 'MARKUP', MK: 'MARKUP', U: 'UNDO', UNDO: 'UNDO', REDO: 'REDO', LA: 'LAYER', LAYER: 'LAYER', ORTHO: 'ORTHO', GRID: 'GRID', SNAP: 'SNAP', SN: 'SNAP', OS: 'OSNAP', OSNAP: 'OSNAP', POLAR: 'POLAR', UN: 'UNITS', UNITS: 'UNITS', HELP: 'HELP',
};
export const COMMANDS = [...new Set(Object.values(ALIASES))].sort();
const SEL_CMDS = new Set(['MOVE', 'COPY', 'ROTATE', 'MIRROR', 'SCALE', 'ERASE']);

/** Parse a typed point: absolute x,y; relative @dx,dy; polar @dist<angle; or a plain distance along the cursor from `last`. */
export function parsePoint(s: string, last: Pt | null, cursor: Pt | null): Pt | null {
  const t = s.trim(); if (!t) return null; const rel = t.startsWith('@'); const b = rel ? t.slice(1) : t;
  const L = (x: string) => parseLength(x.trim(), { signed: true });
  const pol = b.match(/^(.+)<\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (pol) { const d = L(pol[1]); if (d == null) return null; const a = (parseFloat(pol[2]) * Math.PI) / 180; const o = rel ? last ?? { x: 0, y: 0 } : { x: 0, y: 0 }; return { x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d }; }
  const xy = b.split(/\s*[,;]\s*/); if (xy.length === 2) { const x = L(xy[0]), y = L(xy[1]); if (x == null || y == null) return null; const o = rel ? last ?? { x: 0, y: 0 } : { x: 0, y: 0 }; return { x: o.x + x, y: o.y + y }; }
  if (!rel && last) { const d = L(b); if (d == null) return null; const dir = cursor ? { x: cursor.x - last.x, y: cursor.y - last.y } : { x: 1, y: 0 }; const n = Math.hypot(dir.x, dir.y); if (n < 1e-6) return { x: last.x + d, y: last.y }; return { x: last.x + (dir.x / n) * d, y: last.y + (dir.y / n) * d }; }
  return null;
}

const ent = (c: Ctx, t: EntType, pts: Pt[], extra: Partial<Ent> = {}): Ent => ({ id: c.newId(), t, layer: c.layer === 'A-DETL' && LAYER_FOR[t] ? LAYER_FOR[t]! : c.layer, pts, ...extra });
const addEnts = (es: Ent[]) => (d: Project) => { const cad = (d.cad ??= DEFAULT_CAD()); if (cad.ents.length + es.length > MAX_ENTS) return; cad.ents.push(...es); };
const ents = (p: Project) => p.cad?.ents ?? [];
const fbMin = (p: Project) => { const b = bbox(p.adu.footprint); return { x: b.minX, y: b.minY }; };

/** Apply a point map to the selection: drafting entities by id and the selected room (kept inside the garage). Returns false when the room would leave the garage. */
function mapSel(d: Project, c: Ctx, f: (q: Pt) => Pt, o: { rot?: number; flip?: boolean; k?: number }, copy: boolean): boolean {
  const cad = (d.cad ??= DEFAULT_CAD()); const ids = new Set(c.sel);
  const done = cad.ents.filter(e => ids.has(e.id)).map(e => mapEnt(e, f, o));
  if (copy) cad.ents.push(...done.map(e => ({ ...e, id: c.newId() }))); else cad.ents = cad.ents.map(e => done.find(x => x.id === e.id) ?? e);
  if (c.room) {
    const r = d.adu.rooms.find(x => x.id === c.room); if (!r) return true; const off = fbMin(d);
    const poly = applyTape(r).poly.map(q => { const m = f({ x: q.x + off.x, y: q.y + off.y }); return { x: Math.round((m.x - off.x) * 1000) / 1000, y: Math.round((m.y - off.y) * 1000) / 1000 }; });
    if (!roomFits(poly, footLocal(d))) return false;
    if (copy) { if (d.adu.rooms.length >= MAX_ROOMS) return false; d.adu.rooms.push({ ...r, id: c.newId(), name: `${r.name} 2`, poly, tape: { w: null, d: null }, openings: r.openings.map(x => ({ ...x, id: c.newId() })) }); }
    else { r.poly = poly; r.tape = { w: null, d: null }; }
  }
  return true;
}

function prompt(st: St, es: boolean): string {
  const n = st.name, s = st.step;
  if (!n) return T(es, 'Type a command', 'Escriba un comando');
  if (s === 'sel') return T(es, `${n}: select objects, then Enter`, `${n}: seleccione objetos y pulse Enter`);
  const P: Record<string, [string, string]> = {
    'LINE:p0': ['LINE: first point', 'LÍNEA: primer punto'], 'LINE:pn': ['LINE: next point (Enter ends, C closes, U undoes)', 'LÍNEA: siguiente punto (Enter termina, C cierra, U deshace)'],
    'PLINE:p0': ['PLINE: start point', 'POLILÍNEA: punto inicial'], 'PLINE:pn': ['PLINE: next point (Enter ends, C closes)', 'POLILÍNEA: siguiente punto (Enter termina, C cierra)'],
    'RECTANG:p0': ['RECTANG: first corner', 'RECTÁNGULO: primera esquina'], 'RECTANG:p1': ['RECTANG: other corner, or @width,depth', 'RECTÁNGULO: otra esquina, o @ancho,fondo'],
    'CIRCLE:p0': ['CIRCLE: center point', 'CÍRCULO: centro'], 'CIRCLE:r': ['CIRCLE: radius (point or distance)', 'CÍRCULO: radio (punto o distancia)'],
    'ARC:p0': ['ARC: start point', 'ARCO: punto inicial'], 'ARC:p1': ['ARC: second point on the arc', 'ARCO: segundo punto del arco'], 'ARC:p2': ['ARC: end point', 'ARCO: punto final'],
    'TEXT:p0': ['TEXT: start point', 'TEXTO: punto inicial'], 'TEXT:s': ['TEXT: type the text, then Enter', 'TEXTO: escriba el texto y pulse Enter'],
    'MTEXT:p0': ['MTEXT: start point', 'TEXTO MÚLTIPLE: punto inicial'], 'MTEXT:s': ['MTEXT: type the text; \\P starts a new line', 'TEXTO MÚLTIPLE: escriba el texto; \\P empieza otra línea'],
    'LEADER:p0': ['LEADER: arrow point', 'DIRECTRIZ: punta de la flecha'], 'LEADER:pn': ['LEADER: next point (Enter to type the note)', 'DIRECTRIZ: siguiente punto (Enter para escribir la nota)'], 'LEADER:s': ['LEADER: type the note, then Enter', 'DIRECTRIZ: escriba la nota y pulse Enter'],
    'REVCLOUD:p0': ['REVCLOUD: first corner', 'NUBE: primera esquina'], 'REVCLOUD:pn': ['REVCLOUD: next corner (Enter closes)', 'NUBE: siguiente esquina (Enter cierra)'],
    'DIMLINEAR:p0': ['DIMLINEAR: first point', 'COTA LINEAL: primer punto'], 'DIMLINEAR:p1': ['DIMLINEAR: second point', 'COTA LINEAL: segundo punto'], 'DIMLINEAR:p2': ['DIMLINEAR: dimension line location', 'COTA LINEAL: ubicación de la línea de cota'],
    'DIMALIGNED:p0': ['DIMALIGNED: first point', 'COTA ALINEADA: primer punto'], 'DIMALIGNED:p1': ['DIMALIGNED: second point', 'COTA ALINEADA: segundo punto'], 'DIMALIGNED:p2': ['DIMALIGNED: dimension line location', 'COTA ALINEADA: ubicación de la línea de cota'],
    'DIST:p0': ['DIST: first point', 'DISTANCIA: primer punto'], 'DIST:p1': ['DIST: second point', 'DISTANCIA: segundo punto'],
    'AREA:p0': ['AREA: first corner', 'ÁREA: primera esquina'], 'AREA:pn': ['AREA: next corner (Enter totals)', 'ÁREA: siguiente esquina (Enter calcula)'],
    'MOVE:b': ['MOVE: base point', 'MOVER: punto base'], 'MOVE:t': ['MOVE: second point, or @dx,dy', 'MOVER: segundo punto, o @dx,dy'],
    'COPY:b': ['COPY: base point', 'COPIAR: punto base'], 'COPY:t': ['COPY: second point (Enter ends)', 'COPIAR: segundo punto (Enter termina)'],
    'ROTATE:b': ['ROTATE: base point', 'GIRAR: punto base'], 'ROTATE:a': ['ROTATE: angle in degrees (counter-clockwise), or a point', 'GIRAR: ángulo en grados (antihorario), o un punto'],
    'MIRROR:m0': ['MIRROR: first point of the mirror line', 'SIMETRÍA: primer punto del eje'], 'MIRROR:m1': ['MIRROR: second point of the mirror line', 'SIMETRÍA: segundo punto del eje'], 'MIRROR:e': ['MIRROR: Erase source objects? [Yes/No] <No>', 'SIMETRÍA: ¿Borrar los objetos originales? [Sí/No] <No>'],
    'SCALE:b': ['SCALE: base point', 'ESCALA: punto base'], 'SCALE:k': ['SCALE: scale factor', 'ESCALA: factor de escala'],
    'OFFSET:d': ['OFFSET: distance', 'DESFASE: distancia'], 'OFFSET:o': ['OFFSET: select a line, polyline, circle or arc', 'DESFASE: seleccione una línea, polilínea, círculo o arco'], 'OFFSET:s': ['OFFSET: click the side to offset to', 'DESFASE: haga clic en el lado'],
    'TRIM:o': ['TRIM: click the part of a line to remove (Enter ends)', 'RECORTAR: haga clic en la parte de la línea que quiere quitar (Enter termina)'],
    'EXTEND:o': ['EXTEND: click near the end of a line to extend (Enter ends)', 'ALARGAR: haga clic cerca del extremo de la línea (Enter termina)'],
    'ROOM:p0': ['ROOM: first corner inside the garage, or a use: BED, BATH, KITCHEN, LIVING', 'CUARTO: primera esquina dentro del garaje, o un uso: BED, BATH, KITCHEN, LIVING'], 'ROOM:p1': ['ROOM: other corner, or @width,depth', 'CUARTO: otra esquina, o @ancho,fondo'],
    'DOOR:p0': ['DOOR: point on a room wall', 'PUERTA: punto en un muro del cuarto'], 'WINDOW:p0': ['WINDOW: point on a room wall', 'VENTANA: punto en un muro del cuarto'],
    'PIN:p0': ['PIN: point for the review note', 'NOTA: punto de la nota de revisión'],
  };
  const v = P[`${n}:${s}`]; return v ? v[es ? 1 : 0] : n;
}
const out = (st: St, c: Ctx, fx: Effect[] = []): Out => ({ st, prompt: prompt(st, c.es), fx });
const done = (c: Ctx, fx: Effect[] = []): Out => out(IDLE, c, fx);

/** Start a command by name or alias. Unknown text returns a message. */
export function start(name: string, c: Ctx): Out {
  const n = ALIASES[name.trim().toUpperCase()];
  if (!n) return done(c, [{ kind: 'say', msg: T(c.es, `Unknown command "${name}". Type HELP for the list.`, `Comando desconocido "${name}". Escriba HELP para ver la lista.`) }]);
  const simple: Record<string, Effect> = { ORTHO: { kind: 'toggle', what: 'ortho' }, GRID: { kind: 'toggle', what: 'grid' }, SNAP: { kind: 'toggle', what: 'snap' }, OSNAP: { kind: 'toggle', what: 'osnap' }, POLAR: { kind: 'toggle', what: 'polar' }, UNITS: { kind: 'toggle', what: 'units' }, ZOOM: { kind: 'view', what: 'fit' }, ZOOMADU: { kind: 'view', what: 'adu' }, MARKUP: { kind: 'view', what: 'markup' }, UNDO: { kind: 'view', what: 'undo' }, REDO: { kind: 'view', what: 'redo' }, LAYER: { kind: 'view', what: 'layers' }, HELP: { kind: 'view', what: 'help' } };
  if (simple[n]) return done(c, [simple[n]]);
  if (SEL_CMDS.has(n)) {
    if (!c.sel.length && !c.room) return out({ name: n, step: 'sel', pts: [], data: { ids: [] as string[], room: null } }, c);
    return afterSel({ name: n, step: 'sel', pts: [], data: {} }, c);
  }
  const first: Record<string, string> = { OFFSET: 'd', TRIM: 'o', EXTEND: 'o' };
  return out({ name: n, step: first[n] ?? 'p0', pts: [], data: n === 'OFFSET' ? { d: (c as Ctx & { lastOffset?: number }).lastOffset ?? null } : {} }, c);
}
function afterSel(st: St, c: Ctx): Out {
  if (st.name === 'ERASE') { const ids = new Set(c.sel); const room = c.room; return done(c, [{ kind: 'apply', fn: d => { if (d.cad) d.cad.ents = d.cad.ents.filter(e => !ids.has(e.id)); if (room) d.adu.rooms = d.adu.rooms.filter(r => r.id !== room); }, msg: T(c.es, `Erased ${ids.size + (room ? 1 : 0)}.`, `Se borraron ${ids.size + (room ? 1 : 0)}.`) }, { kind: 'select', ids: [], room: null }]); }
  const first: Record<string, string> = { MOVE: 'b', COPY: 'b', ROTATE: 'b', MIRROR: 'm0', SCALE: 'b' };
  return out({ ...st, step: first[st.name!] }, c);
}

/** A picked or typed point for the current step. */
export function point(st: St, q: Pt, c: Ctx): Out {
  const n = st.name; if (!n) return out(st, c);
  const pts = [...st.pts, q]; const last = st.pts[st.pts.length - 1];
  switch (n) {
    case 'LINE': if (st.step === 'p0') return out({ ...st, step: 'pn', pts }, c);
      return out({ ...st, pts }, c, [{ kind: 'apply', fn: addEnts([ent(c, 'line', [last, q])]) }]);
    case 'PLINE': case 'REVCLOUD': case 'AREA': return out({ ...st, step: 'pn', pts }, c);
    case 'LEADER': return out({ ...st, step: 'pn', pts }, c);
    case 'RECTANG': case 'ROOM': if (st.step === 'p0') return out({ ...st, step: 'p1', pts }, c); return finishRect(st, q, c);
    case 'CIRCLE': if (st.step === 'p0') return out({ ...st, step: 'r', pts }, c); return radius(st, Math.hypot(q.x - st.pts[0].x, q.y - st.pts[0].y), c);
    case 'ARC': if (st.step === 'p0') return out({ ...st, step: 'p1', pts }, c); if (st.step === 'p1') return out({ ...st, step: 'p2', pts }, c);
      { const a = arc3(st.pts[0], st.pts[1], q); if (!a) return out(st, c, [{ kind: 'say', msg: T(c.es, 'The three points are in a line. Pick another end point.', 'Los tres puntos están en línea. Elija otro punto final.') }]);
        return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'arc', [a.c], { r: a.r, a0: a.a0, a1: a.a1 })]), msg: T(c.es, `Arc, radius ${fmtArch(a.r)}.`, `Arco, radio ${fmtArch(a.r)}.`) }]); }
    case 'TEXT': case 'MTEXT': return out({ ...st, step: 's', pts }, c);
    case 'DIMLINEAR': case 'DIMALIGNED': if (st.step !== 'p2') return out({ ...st, step: st.step === 'p0' ? 'p1' : 'p2', pts }, c); return finishDim(st, q, c);
    case 'DIST': if (st.step === 'p0') return out({ ...st, step: 'p1', pts }, c);
      { const a = st.pts[0]; const d = Math.hypot(q.x - a.x, q.y - a.y); const ang = (Math.atan2(q.y - a.y, q.x - a.x) * 180) / Math.PI;
        return done(c, [{ kind: 'say', msg: `${T(c.es, 'Distance', 'Distancia')} ${fmtArch(d)} · ΔX ${fmtArch(Math.abs(q.x - a.x))} · ΔY ${fmtArch(Math.abs(q.y - a.y))} · ${T(c.es, 'angle', 'ángulo')} ${ang.toFixed(1)}°` }]); }
    case 'MOVE': case 'COPY': case 'SCALE': case 'ROTATE':
      if (st.step === 'b') return out({ ...st, step: n === 'ROTATE' ? 'a' : n === 'SCALE' ? 'k' : 't', pts }, c);
      if (n === 'ROTATE') return rotate(st, Math.atan2(q.y - st.pts[0].y, q.x - st.pts[0].x), c);
      if (n === 'SCALE') { const k = Math.hypot(q.x - st.pts[0].x, q.y - st.pts[0].y) / ft(1); return scale(st, k, c); }
      { const dx = q.x - st.pts[0].x, dy = q.y - st.pts[0].y; let ok = true; const fx: Effect = { kind: 'apply', fn: d => { ok = mapSel(d, c, moveF(dx, dy), {}, n === 'COPY'); if (!ok) throw new Error('room outside'); }, msg: T(c.es, `${n === 'COPY' ? 'Copied' : 'Moved'} ${fmtArch(Math.hypot(dx, dy))}.`, `${n === 'COPY' ? 'Copiado' : 'Movido'} ${fmtArch(Math.hypot(dx, dy))}.`) };
        void ok; return n === 'COPY' ? out({ ...st }, c, [fx]) : done(c, [fx]); }
    case 'MIRROR': if (st.step === 'm0') return out({ ...st, step: 'm1', pts }, c);
      // Like AutoCAD: ask whether to erase the source objects; the default (Enter) keeps them.
      if (st.step === 'm1') return out({ ...st, step: 'e', pts }, c);
      return out(st, c);
    case 'OFFSET': {
      if (st.step === 'd') { const d = Math.hypot(q.x - (last?.x ?? q.x), q.y - (last?.y ?? q.y)); if (!last) return out({ ...st, pts }, c); return out({ ...st, step: 'o', pts: [], data: { d } }, c); }
      if (st.step === 'o') { const h = c.hit(q); const e = h?.ent ? ents(c.p).find(x => x.id === h.ent) : null; if (!e || !['line', 'pline', 'circle', 'arc'].includes(e.t)) return out(st, c, [{ kind: 'say', msg: T(c.es, 'Pick a line, polyline, circle or arc.', 'Elija una línea, polilínea, círculo o arco.') }]); return out({ ...st, step: 's', data: { ...st.data, id: e.id } }, c); }
      { const e = ents(c.p).find(x => x.id === st.data.id); const d = st.data.d as number; const o = e ? offsetEnt(e, d, q, c.newId()) : null; if (!o) return out({ ...st, step: 'o' }, c, [{ kind: 'say', msg: T(c.es, 'That offset is not possible.', 'Ese desfase no es posible.') }]);
        return out({ ...st, step: 'o' }, c, [{ kind: 'apply', fn: addEnts([o]), msg: T(c.es, `Offset ${fmtArch(d)}.`, `Desfase ${fmtArch(d)}.`) }]); }
    }
    case 'TRIM': case 'EXTEND': { const h = c.hit(q); const e = h?.ent ? ents(c.p).find(x => x.id === h.ent) : null;
      if (!e || e.t !== 'line') return out(st, c, [{ kind: 'say', msg: T(c.es, 'Pick a line.', 'Elija una línea.') }]);
      const others = ents(c.p);
      if (n === 'TRIM') { const r = trimLine(e, q, others, c.newId); if (!r) return out(st, c); return out(st, c, [{ kind: 'apply', fn: d => { const cad = d.cad!; const i = cad.ents.findIndex(x => x.id === e.id); if (i >= 0) cad.ents.splice(i, 1, ...r); }, msg: r.length ? T(c.es, 'Trimmed.', 'Recortado.') : T(c.es, 'Nothing crosses it; the line was erased.', 'Nada la cruza; se borró la línea.') }]); }
      const r = extendLine(e, q, others); if (!r) return out(st, c, [{ kind: 'say', msg: T(c.es, 'Nothing to extend to in that direction.', 'No hay nada hasta donde alargar en esa dirección.') }]);
      return out(st, c, [{ kind: 'apply', fn: d => { const cad = d.cad!; const i = cad.ents.findIndex(x => x.id === e.id); if (i >= 0) cad.ents[i] = r; }, msg: T(c.es, 'Extended.', 'Alargado.') }]); }
    case 'DOOR': case 'WINDOW': return placeOpening(q, n === 'DOOR' ? 'door' : 'window', c);
    case 'PIN': return done(c, [{ kind: 'apply', fn: d => { const nn = d.markup.pins.reduce((m, x) => Math.max(m, x.n), 0) + 1; d.markup.pins.push({ id: c.newId(), n: nn, x: q.x, y: q.y, comment: '', status: 'open', author: '', at: new Date().toISOString().slice(0, 10) }); }, msg: T(c.es, 'Review note added.', 'Nota de revisión agregada.') }]);
  }
  return out(st, c);
}

function finishRect(st: St, q: Pt, c: Ctx): Out {
  const a = st.pts[0]; const x0 = Math.min(a.x, q.x), x1 = Math.max(a.x, q.x), y0 = Math.min(a.y, q.y), y1 = Math.max(a.y, q.y);
  if (x1 - x0 < 1 || y1 - y0 < 1) return out(st, c, [{ kind: 'say', msg: T(c.es, 'The corners are the same point.', 'Las esquinas son el mismo punto.') }]);
  const pts = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  if (st.name === 'RECTANG') return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'pline', pts, { closed: true })]), msg: T(c.es, `Rectangle ${fmtArch(x1 - x0)} × ${fmtArch(y1 - y0)}.`, `Rectángulo ${fmtArch(x1 - x0)} × ${fmtArch(y1 - y0)}.`) }]);
  // ROOM: in garage-local coordinates; must fit inside the garage.
  const p = c.p; if (p.adu.rooms.length >= MAX_ROOMS) return done(c, [{ kind: 'say', msg: T(c.es, 'This garage already has the most rooms allowed.', 'Este garaje ya tiene el máximo de cuartos.') }]);
  const o = fbMin(p); const poly = translate(pts, -o.x, -o.y).map(v => ({ x: Math.round(v.x * 1000) / 1000, y: Math.round(v.y * 1000) / 1000 }));
  if (x1 - x0 < ft(3) || y1 - y0 < ft(3)) return out(st, c, [{ kind: 'say', msg: T(c.es, 'Rooms must be at least 3 ft on each side.', 'Los cuartos deben medir al menos 3 pies por lado.') }]);
  if (!roomFits(poly, footLocal(p))) return out(st, c, [{ kind: 'say', msg: T(c.es, 'Draw the room inside the garage walls.', 'Dibuje el cuarto dentro de los muros del garaje.') }]);
  const id = c.newId(); const nn = p.adu.rooms.length + 1;
  return done(c, [{ kind: 'apply', fn: d => { d.adu.rooms.push({ id, name: roomName(st.data.use as string | undefined, nn, c.es), use: (st.data.use as Room['use'] | undefined) ?? 'living', shape: 'rect', poly, tape: { w: null, d: null }, ceilingMm: null, openings: [] } as Room); }, msg: T(c.es, `Room ${fmtArch(x1 - x0)} × ${fmtArch(y1 - y0)} added.`, `Cuarto de ${fmtArch(x1 - x0)} × ${fmtArch(y1 - y0)} agregado.`) }, { kind: 'select', ids: [], room: id }]);
}
const roomName = (u: string | undefined, n: number, es: boolean) => (u === 'sleeping' ? T(es, 'Bedroom', 'Recámara') : u === 'bath' ? T(es, 'Bath', 'Baño') : u === 'kitchen' ? T(es, 'Kitchen', 'Cocina') : u === 'living' ? T(es, 'Living', 'Sala') : `${T(es, 'Room', 'Cuarto')} ${n}`);
function radius(st: St, r: number, c: Ctx): Out {
  if (!(r > 0)) return out(st, c, [{ kind: 'say', msg: T(c.es, 'The radius must be more than zero.', 'El radio debe ser mayor que cero.') }]);
  return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'circle', [st.pts[0]], { r })]), msg: T(c.es, `Circle, radius ${fmtArch(r)}.`, `Círculo, radio ${fmtArch(r)}.`) }]);
}
function finishDim(st: St, q: Pt, c: Ctx): Out {
  const [a, b] = st.pts; let rot: number | undefined;
  if (st.name === 'DIMLINEAR') { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; rot = Math.abs(q.y - my) >= Math.abs(q.x - mx) ? 0 : Math.PI / 2; }
  const g = dimGeom({ id: '', t: 'dim', layer: '', pts: [a, b], rot, off: 0 }); if (g.len < 1) return done(c, [{ kind: 'say', msg: T(c.es, 'The two points measure zero.', 'Los dos puntos miden cero.') }]);
  const off = (q.x - a.x) * g.n.x + (q.y - a.y) * g.n.y;
  return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'dim', [a, b], { off, ...(rot != null ? { rot } : {}) })]), msg: `${T(c.es, 'Dimension', 'Cota')} ${fmtArch(g.len)}.` }]);
}
/** Dimension geometry: direction u, normal n, the dimension line ends (A, B) and the measured length. Linear dims have `rot`. */
export function dimGeom(e: Ent): { u: Pt; n: Pt; A: Pt; B: Pt; len: number } {
  const [a, b] = e.pts; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = e.rot != null ? { x: Math.cos(e.rot), y: Math.sin(e.rot) } : { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; const n = { x: -u.y, y: u.x };
  const off = e.off ?? 0; const A = { x: a.x + n.x * off, y: a.y + n.y * off }; const t = (b.x - a.x) * u.x + (b.y - a.y) * u.y; const B = { x: A.x + u.x * t, y: A.y + u.y * t };
  return { u, n, A, B, len: Math.abs(t) };
}
function rotate(st: St, ang: number, c: Ctx): Out {
  let ok = true; return done(c, [{ kind: 'apply', fn: d => { ok = mapSel(d, c, rotF(st.pts[0], ang), { rot: ang }, false); if (!ok) throw new Error('room'); }, msg: T(c.es, `Rotated ${Math.round((ang * 180) / Math.PI)}°.`, `Girado ${Math.round((ang * 180) / Math.PI)}°.`) }]);
}
function scale(st: St, k: number, c: Ctx): Out {
  if (!(k > 0) || !Number.isFinite(k)) return out(st, c, [{ kind: 'say', msg: T(c.es, 'Enter a factor greater than zero.', 'Escriba un factor mayor que cero.') }]);
  return done(c, [{ kind: 'apply', fn: d => { if (!mapSel(d, c, scaleF(st.pts[0], k), { k }, false)) throw new Error('room'); }, msg: T(c.es, `Scaled ×${k}.`, `Escalado ×${k}.`) }]);
}
function placeOpening(q: Pt, kind: 'door' | 'window', c: Ctx): Out {
  const p = c.p; const o = fbMin(p); let best: { r: Room; wall: number; t: number; d: number; L: number } | null = null;
  for (const r of p.adu.rooms) { const pl = applyTape(r).poly; pl.forEach((a0, i) => { const b0 = pl[(i + 1) % pl.length]; const a = { x: a0.x + o.x, y: a0.y + o.y }, b = { x: b0.x + o.x, y: b0.y + o.y }; const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (!L) return; const t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L; const d = Math.abs(((q.x - a.x) * -dy + (q.y - a.y) * dx) / L); if (t < 0 || t > L) return; if (!best || d < best.d) best = { r, wall: i, t, d, L }; }); }
  const b = best as { r: Room; wall: number; t: number; d: number; L: number } | null;
  if (!b || b.d > ft(1.5)) return out({ name: kind === 'door' ? 'DOOR' : 'WINDOW', step: 'p0', pts: [], data: {} }, c, [{ kind: 'say', msg: p.adu.rooms.length ? T(c.es, 'Pick a point on a room wall.', 'Elija un punto en un muro del cuarto.') : T(c.es, 'Draw a room first, then add doors and windows to its walls.', 'Dibuje un cuarto primero; luego agregue puertas y ventanas a sus muros.') }]);
  if (b.r.openings.length >= MAX_OPENINGS) return done(c, [{ kind: 'say', msg: T(c.es, 'This room already has the most openings allowed.', 'Este cuarto ya tiene el máximo de aberturas.') }]);
  const w = kind === 'door' ? inch(32) : inch(36); if (b.L < w) return done(c, [{ kind: 'say', msg: T(c.es, 'This wall is too short for it.', 'Este muro es muy corto.') }]);
  const off = Math.max(0, Math.min(b.L - w, Math.round((b.t - w / 2) / inch(1)) * inch(1))); const id = c.newId(); const rid = b.r.id;
  return done(c, [{ kind: 'apply', fn: d => { const r = d.adu.rooms.find(x => x.id === rid); if (r) r.openings.push({ id, kind, wall: b.wall, offsetMm: off, widthMm: w, heightMm: kind === 'door' ? inch(80) : inch(48), sillMm: kind === 'door' ? null : inch(32) }); }, msg: kind === 'door' ? T(c.es, "Door 2'-8\" added.", "Puerta de 2'-8\" agregada.") : T(c.es, "Window 3'-0\" x 4'-0\" added, sill 2'-8\" (head at 6'-8\", in line with the doors). Check its clear opening in Properties.", "Ventana de 3'-0\" x 4'-0\" agregada, antepecho 2'-8\" (cabezal a 6'-8\", alineado con las puertas). Revise su abertura libre en Propiedades.") }]);
}

/** Typed text for the current step: a point, a distance, an angle, an option letter, or the note text. */
export function text(st: St, s: string, c: Ctx): Out {
  const n = st.name; if (!n) { const t = s.trim(); return t ? start(t, c) : out(st, c); }
  const up = s.trim().toUpperCase(); const last = st.pts[st.pts.length - 1] ?? null;
  if ((n === 'TEXT' || n === 'MTEXT') && st.step === 's') { const v = s.replace(/\\P/g, '\n').trim(); if (!v) return done(c); return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'text', [st.pts[0]], { text: v, h: c.textH, rot: 0 })]), msg: T(c.es, 'Text added.', 'Texto agregado.') }]); }
  if (n === 'LEADER' && st.step === 's') { const v = s.trim(); return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'leader', st.pts, { text: v, h: c.textH })]), msg: T(c.es, 'Leader added.', 'Directriz agregada.') }]); }
  if (st.step === 'sel') return out(st, c);
  if (n === 'MIRROR' && st.step === 'e') { if (/^(Y|YES|S|SI|SÍ)$/.test(up)) return mirrorDone(st, c, true); if (up === '' || /^(N|NO)$/.test(up)) return mirrorDone(st, c, false); return out(st, c, [{ kind: 'say', msg: T(c.es, 'Type Y (yes) or N (no).', 'Escriba S (sí) o N (no).') }]); }
  if (n === 'ROOM' && st.step === 'p0') { const u = ({ BED: 'sleeping', BEDROOM: 'sleeping', SLEEP: 'sleeping', BATH: 'bath', BA: 'bath', KITCHEN: 'kitchen', KIT: 'kitchen', LIVING: 'living', LIV: 'living', COCINA: 'kitchen', BAÑO: 'bath', RECAMARA: 'sleeping', SALA: 'living' } as Record<string, string>)[up]; if (u) return out({ ...st, data: { ...st.data, use: u } }, c, [{ kind: 'say', msg: T(c.es, `Room use: ${u}.`, `Uso del cuarto: ${u}.`) }]); }
  if ((n === 'LINE' || n === 'PLINE') && st.step === 'pn' && up === 'C') return close(st, c);
  if (n === 'LINE' && st.step === 'pn' && up === 'U') { const pts = st.pts.slice(0, -1); return out({ ...st, pts, step: pts.length ? 'pn' : 'p0' }, c, [{ kind: 'apply', fn: d => { if (d.cad) d.cad.ents.pop(); } }]); }
  if (n === 'CIRCLE' && st.step === 'r') { const r = parseLength(s); if (r != null) return radius(st, r, c); }
  if (n === 'ROTATE' && st.step === 'a') { const a = parseFloat(s); if (Number.isFinite(a)) return rotate(st, (a * Math.PI) / 180, c); }
  if (n === 'SCALE' && st.step === 'k') { const k = parseFloat(s); if (Number.isFinite(k)) return scale(st, k, c); }
  if (n === 'OFFSET' && st.step === 'd') { const d = parseLength(s); if (d != null && d > 0) return out({ ...st, step: 'o', data: { d } }, c); return out(st, c, [{ kind: 'say', msg: T(c.es, 'Type a distance like 4 or 0\'-6".', 'Escriba una distancia como 4 o 0\'-6".') }]); }
  const base = (n === 'MOVE' || n === 'COPY') && st.step === 't' ? st.pts[0] : last;
  const q = parsePoint(s, base, c.cursor);
  if (!q) return out(st, c, [{ kind: 'say', msg: T(c.es, `Not understood: "${s}". Type a point like 10,20 or @5,0 or @12<90, or a distance.`, `No se entendió: "${s}". Escriba un punto como 10,20 o @5,0 o @12<90, o una distancia.`) }]);
  return point(st, q, c);
}
/** MIRROR result: a mirrored copy (source kept, the default) or the source replaced. A room that would land outside the garage says so. */
function mirrorDone(st: St, c: Ctx, erase: boolean): Out {
  const [a, b] = st.pts; return done(c, [{ kind: 'apply', fn: d => { if (!mapSel(d, c, mirrorF(a, b), { flip: true }, !erase)) throw new Error('room outside'); }, msg: erase ? T(c.es, 'Mirrored; source erased.', 'Reflejado; original borrado.') : T(c.es, 'Mirrored copy added; source kept.', 'Copia reflejada agregada; se conservó el original.') }]);
}
function close(st: St, c: Ctx): Out {
  if (st.pts.length < 3) return done(c);
  if (st.name === 'LINE') return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'line', [st.pts[st.pts.length - 1], st.pts[0]])]) }]);
  return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'pline', st.pts, { closed: true })]), msg: T(c.es, 'Closed polyline added.', 'Polilínea cerrada agregada.') }]);
}
/** Enter (or Space): finish multi-point commands, end selection, repeat nothing when idle. */
export function enter(st: St, c: Ctx, lastCmd?: string | null): Out {
  const n = st.name; if (!n) return lastCmd ? start(lastCmd, c) : out(st, c);
  if (st.step === 'sel') return c.sel.length || c.room ? afterSel(st, c) : done(c);
  if (n === 'PLINE' && st.pts.length >= 2) return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'pline', st.pts)]), msg: T(c.es, 'Polyline added.', 'Polilínea agregada.') }]);
  if (n === 'REVCLOUD' && st.pts.length >= 3) return done(c, [{ kind: 'apply', fn: addEnts([ent(c, 'cloud', st.pts, { closed: true })]), msg: T(c.es, 'Revision cloud added.', 'Nube de revisión agregada.') }]);
  if (n === 'AREA' && st.pts.length >= 3) { let a = 0, per = 0; st.pts.forEach((q, i) => { const r = st.pts[(i + 1) % st.pts.length]; a += q.x * r.y - r.x * q.y; per += Math.hypot(r.x - q.x, r.y - q.y); }); return done(c, [{ kind: 'say', msg: `${T(c.es, 'Area', 'Área')} ${Math.round(Math.abs(a) / 2 / 92903.04 * 10) / 10} ${T(c.es, 'sq ft', 'pies²')} · ${T(c.es, 'perimeter', 'perímetro')} ${fmtArch(per)}` }]); }
  if (n === 'LEADER' && st.pts.length >= 2) return out({ ...st, step: 's' }, c);
  if (n === 'MIRROR' && st.step === 'e') return mirrorDone(st, c, false);
  return done(c);
}
export const esc = (c: Ctx): Out => done(c, [{ kind: 'say', msg: T(c.es, 'Cancelled.', 'Cancelado.') }]);
/** Base point for rubber-banding, ortho and direct distance entry. */
export const basePt = (st: St): Pt | null => (st.name === 'MOVE' || st.name === 'COPY' || st.name === 'ROTATE' || st.name === 'SCALE') && st.step !== 'b' ? st.pts[0] ?? null : st.pts[st.pts.length - 1] ?? null;
/** Live preview of what the next point would make (rubber band). */
export function previewOf(st: St, q: Pt | null, c: Ctx): Ent[] {
  if (!st.name || !q) return []; const P = (t: EntType, pts: Pt[], x: Partial<Ent> = {}): Ent => ({ id: 'preview', t, layer: c.layer, pts, ...x }); const a = st.pts[0]; const last = st.pts[st.pts.length - 1];
  switch (st.name) {
    case 'LINE': case 'DIST': case 'MIRROR': return last ? [P('line', [last, q])] : [];
    case 'PLINE': case 'LEADER': case 'AREA': return st.pts.length ? [P('pline', [...st.pts, q], { closed: st.name === 'AREA' })] : [];
    case 'REVCLOUD': return st.pts.length ? [P('pline', [...st.pts, q], { closed: true })] : [];
    case 'RECTANG': case 'ROOM': return a ? [P('pline', [a, { x: q.x, y: a.y }, q, { x: a.x, y: q.y }], { closed: true })] : [];
    case 'CIRCLE': return a ? [P('circle', [a], { r: Math.max(1, Math.hypot(q.x - a.x, q.y - a.y)) })] : [];
    case 'ARC': { if (st.pts.length === 1) return [P('line', [a, q])]; if (st.pts.length === 2) { const r = arc3(st.pts[0], st.pts[1], q); return r ? [P('arc', [r.c], { r: r.r, a0: r.a0, a1: r.a1 })] : []; } return []; }
    case 'DIMLINEAR': case 'DIMALIGNED': if (st.pts.length === 2) { const [p0, p1] = st.pts; let rot: number | undefined; if (st.name === 'DIMLINEAR') { rot = Math.abs(q.y - (p0.y + p1.y) / 2) >= Math.abs(q.x - (p0.x + p1.x) / 2) ? 0 : Math.PI / 2; } const g = dimGeom({ id: '', t: 'dim', layer: '', pts: [p0, p1], rot, off: 0 }); const off = (q.x - p0.x) * g.n.x + (q.y - p0.y) * g.n.y; return [P('dim', [p0, p1], { off, ...(rot != null ? { rot } : {}) })]; } return last ? [P('line', [last, q])] : [];
    case 'MOVE': case 'COPY': if (st.step === 't' && a) { const ids = new Set(c.sel); return (c.p.cad?.ents ?? []).filter(e => ids.has(e.id)).map(e => ({ ...mapEnt(e, moveF(q.x - a.x, q.y - a.y)), id: 'preview' })); } return [];
    case 'ROTATE': if (st.step === 'a' && a) { const ang = Math.atan2(q.y - a.y, q.x - a.x); const ids = new Set(c.sel); return [P('line', [a, q]), ...(c.p.cad?.ents ?? []).filter(e => ids.has(e.id)).map(e => ({ ...mapEnt(e, rotF(a, ang), { rot: ang }), id: 'preview' }))]; } return [];
  }
  return [];
}
