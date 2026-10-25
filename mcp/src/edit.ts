// edit_project: one general field-path editor for everything the app's screens can change.
// A list of ops is applied to a copy, then the copy must survive the app's own file check (migrate) unchanged,
// so an edit can never store a value the app would repair or drop.
import type { Project, Room, Opening, Pin, Response, Window } from '../../app/src/core/model';
import { ROOM_USES, MODULES, uid } from '../../app/src/core/model';
import { migrate, serialize, MAX_PINS, MAX_RESPONSES, MAX_WINDOWS } from '../../app/src/core/permitpack';
import { MAX_ROOMS, MAX_OPENINGS, addRoom } from '../../app/src/core/rooms';
import { nextPinNumber, defaultPinSpot, parseLetter } from '../../app/src/core/markup';
import { unmark, applyParcel, type MapField } from '../../app/src/io/parcel-apply';
import type { ParcelFill } from '../../app/src/io/parcel';
import { CATALOG } from '../../app/src/rules/ladbs-adu-2025';
import { RULES } from '../../app/src/rules/la-city';
import { canDismiss } from '../../app/src/rules/engine';
import { autoFit } from '../../app/src/rules/fit';
import { bbox, rect, type Poly } from '../../app/src/core/geom';
import { ft, inch, fmtFtIn, parseLength, MAX_LEN_MM } from '../../app/src/core/units';
import { ToolError } from './guard';

export type Op =
  | { op: 'set'; path: string; value?: unknown }
  | { op: 'add'; path: string; value?: unknown }
  | { op: 'remove'; path: string }
  | { op: 'autofit' }
  | { op: 'move'; dx: string | number; dy: string | number }
  | { op: 'letter'; text: string; replace?: boolean }
  | { op: 'parcel'; fill: ParcelFill };

const bad = (msg: string, hint?: string) => new ToolError('invalid_edit', msg, hint);
const TRI = ['yes', 'no', 'unknown'];
const ENUMS: Record<string, readonly string[]> = {
  mode: ['conversion', 'youadu'], jurisdiction: ['la-city', 'la-county', 'other', 'unknown'], lotSource: ['manual', 'gis', 'survey'],
  mainBuilding: ['sfd', 'duplex', 'multifamily', 'unknown'], garageAttachment: ['detached', 'attached', 'unknown'], garageConstruction: ['wood', 'masonry', 'concrete', 'unknown'],
  preparerRole: ['owner', 'drafter', 'contractor', 'architect', 'engineer'], language: ['en', 'es'], use: ROOM_USES, shape: ['rect', 'poly'], kind: ['door', 'window'], status: ['open', 'resolved'],
};
/** [min, max, integer] for plain numbers. */
const NUMS: Record<string, [number, number, boolean?]> = {
  interiorLivableSqFt: [1, 5000], addedAreaSqFt: [0, 1000], hosePullFt: [0, 2000], panelAmps: [0, 2000], bedrooms: [0, 20, true], existingAdus: [0, 20, true], existingJadus: [0, 20, true],
  northDeg: [0, 359.999], streetEdge: [0, 1000, true], wall: [0, 63, true], n: [1, 99999, true],
};
const STR_MAX: Record<string, number> = { name: 120, address: 500, apn: 40, legalDescription: 300, zone: 40, ownerName: 120, preparerName: 120, engineerName: 120, preparerLicense: 40, room: 60, comment: 2000, author: 80, ref: 40, text: 2000, response: 2000, sheet: 60, reason: 300, pinId: 60 };
/** Lengths with a sensible range (mm). Others ending in Mm get 0..MAX_LEN_MM. */
const LEN: Record<string, [number, number]> = { aduSide: [ft(6), ft(200)], heightMm: [ft(7), ft(60)], ceilingHeightMm: [ft(5), ft(30)], primaryHeightMm: [ft(6), ft(100)], ceilingMm: [ft(5), ft(30)], openingWidthMm: [inch(6), ft(20)], openingHeightMm: [inch(6), ft(12)], openingSillMm: [0, ft(12)], clearWidthMm: [0, ft(20)], clearHeightMm: [0, ft(20)], sillMm: [0, ft(20)] };
const SIGNED = new Set(['x', 'y', 'offsetMm']);
const LOCKED = new Set(['id', 'format', 'version', 'createdAt', 'updatedAt', 'rulePack', 'rev', 'repairNotes', 'parcel', 'at', 'fromMap', 'failed', 'matched', 'cityName', 'openings', 'windows', 'rooms', 'pins', 'responses', 'markup', 'dismissed', 'site', 'adu', 'people', 'flags', 'tape', 'confirmed']);
/** Field edits that make a map value the user's own (the app does the same when a field is typed). */
const MAP_KEY: Record<string, MapField> = { 'site.lot': 'lot', 'site.apn': 'apn', 'site.zone': 'zone', 'site.jurisdiction': 'jurisdiction', 'site.flags.hillside': 'hillside', 'site.flags.vhfhsz': 'vhfhsz', 'site.flags.coastal': 'coastal', 'site.flags.hpoz': 'hpoz', 'site.primary': 'house', 'adu.footprint': 'garage', 'site.flags.fireRebuild': 'burn' };
const CONFIRM: Record<string, 'lot' | 'house' | 'adu'> = { 'site.lot': 'lot', 'site.primary': 'house', 'site.primaryHeightMm': 'house', 'adu.footprint': 'adu', 'adu.width': 'adu', 'adu.depth': 'adu', 'adu.heightMm': 'adu' };

type Seg = string | number;
/** "adu.rooms[0].openings[1].widthMm" -> ['adu','rooms',0,'openings',1,'widthMm']; "sheet.II.C.3" keeps "II.C.3" as one key. */
export function parsePath(path: string): Seg[] {
  if (typeof path !== 'string' || !path || path.length > 200) throw bad('Give a field path like adu.rooms[0].name.');
  const m = path.match(/^(sheet|docs|modules)\.(.+)$/); if (m) return [m[1], m[2]];
  if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*|\[\d{1,4}\])*$/.test(path)) throw bad(`"${path.slice(0, 60)}" is not a field path.`, 'Use dots and [index], for example adu.rooms[0].openings[1].widthMm or site.flags.hillside.');
  return path.split(/\.|(?=\[)/).map(s => (s.startsWith('[') ? Number(s.slice(1, -1)) : s));
}
const show = (segs: Seg[]) => segs.map((s, i) => (typeof s === 'number' ? `[${s}]` : i ? '.' + s : s)).join('');
function walk(p: Project, segs: Seg[]): { parent: Record<string | number, unknown>; key: Seg } {
  let cur: unknown = p;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]; const next = (cur as Record<string | number, unknown>)?.[s];
    if (next == null || typeof next !== 'object') throw bad(`${show(segs.slice(0, i + 1))} does not exist.`, typeof s === 'number' ? 'Check the index with get_project.' : 'Check the field name with get_project.');
    cur = next;
  }
  return { parent: cur as Record<string | number, unknown>, key: segs[segs.length - 1] };
}

function length(key: string, v: unknown, label: string, signed = SIGNED.has(key)): number {
  if (v === undefined || v === '') throw bad(`${label} needs a value, for example 20' 6" (or a number of millimetres).`);
  const mm = typeof v === 'number' ? v : typeof v === 'string' ? parseLength(v, { signed }) : null;
  const [lo, hi] = LEN[key] ?? [signed ? -MAX_LEN_MM : 0, MAX_LEN_MM];
  if (mm == null || !Number.isFinite(mm) || mm < lo || mm > hi) throw bad(`Could not use ${JSON.stringify(v).slice(0, 40)} for ${label} (allowed ${signed && lo < 0 ? '-' + fmtFtIn(-lo) : fmtFtIn(lo)} to ${fmtFtIn(hi)}).`, 'Write feet and inches like 20\' 6" or 20-6, or a number of millimetres.');
  return Math.round(mm * 1000) / 1000;
}
const pt = (q: unknown, label: string) => { const o = q as Record<string, unknown>; if (!o || typeof o !== 'object') throw bad(`${label}: each corner needs x and y.`); return { x: length('x', o.x, label + ' x'), y: length('y', o.y, label + ' y') }; };
/** A shape: an array of corners, or a rectangle {w, d, x?, y?}. */
function poly(v: unknown, label: string, origin?: { x: number; y: number }): Poly {
  if (Array.isArray(v)) { if (v.length < 3 || v.length > 64) throw bad(`${label} needs 3 to 64 corners.`); return v.map((q, i) => pt(q, `${label}[${i}]`)); }
  const o = v as Record<string, unknown>;
  if (o && typeof o === 'object' && 'w' in o && 'd' in o) { const x = o.x === undefined ? origin?.x ?? 0 : length('x', o.x, label + ' x'); const y = o.y === undefined ? origin?.y ?? 0 : length('y', o.y, label + ' y'); return rect(x, y, length('w', o.w, label + ' width', false), length('d', o.d, label + ' depth', false)); }
  throw bad(`${label} needs corners [{x,y},...] or a rectangle {w, d, x, y}.`, 'Lengths can be feet and inches, like {"w":"10\'","d":"12\'"}.');
}
function scalar(segs: Seg[], key: string, cur: unknown, v: unknown, label: string): unknown {
  if (ENUMS[key]) { if (!ENUMS[key].includes(v as string)) throw bad(`${label} must be one of: ${ENUMS[key].join(', ')}.`); return v; }
  if (TRI.includes(cur as string)) { if (!TRI.includes(v as string)) throw bad(`${label} must be yes, no or unknown.`); return v; }
  if (key.endsWith('Mm') || SIGNED.has(key) || ((key === 'w' || key === 'd') && segs[segs.length - 2] === 'tape')) { if (v === null) return null; const k = segs.includes('openings') && key !== 'offsetMm' ? 'opening' + key[0].toUpperCase() + key.slice(1) : key; return length(k, v, label, SIGNED.has(key)); }
  if (NUMS[key]) { if (v === null) return null; const [lo, hi, int] = NUMS[key]; const n = typeof v === 'string' ? Number(v) : v; if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) throw bad(`${label} must be ${int ? 'a whole number' : 'a number'} from ${lo} to ${hi}.`); return n; }
  if (key === 'applicationDate') { if (v === null) return null; if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad('applicationDate must be a date like 2026-11-02, or null for today.'); return v; }
  if (typeof cur === 'boolean' || ['legalization', 'jurisdictionConfirmed', 'sleeping', 'gradeFloor', 'done'].includes(key)) { const b = v === 'yes' ? true : v === 'no' ? false : v; if (typeof b !== 'boolean') throw bad(`${label} must be true or false.`); return b; }
  if (typeof cur === 'string' || STR_MAX[key] || cur === undefined) { if (typeof v !== 'string') throw bad(`${label} must be text.`); const max = STR_MAX[key] ?? 120; if (v.length > max) throw bad(`${label} is too long (${max} characters at most).`); return v; }
  throw bad(`${show(segs)} can't be set directly.`);
}

function opening(r: Room, v: Record<string, unknown>, label: string): Opening {
  const kind = v.kind === 'door' ? 'door' : v.kind === 'window' ? 'window' : null; if (!kind) throw bad(`${label}: kind must be door or window.`);
  const wall = Number(v.wall ?? 0); if (!Number.isInteger(wall) || wall < 0 || wall >= r.poly.length) throw bad(`${label}: wall must be 0 to ${r.poly.length - 1} (0 = front/street side, 1 = right, 2 = back, 3 = left on a rectangle room).`);
  const g = (k: string, alt: string) => v[k] ?? v[alt];
  return { id: uid(), kind, wall, offsetMm: length('offsetMm', g('offsetMm', 'offset') ?? 0, label + ' offset'), widthMm: length('openingWidthMm', g('widthMm', 'width') ?? (kind === 'door' ? inch(32) : undefined), label + ' width'),
    heightMm: g('heightMm', 'height') == null ? (kind === 'door' ? inch(80) : null) : length('openingHeightMm', g('heightMm', 'height'), label + ' height'), sillMm: g('sillMm', 'sill') == null ? null : length('openingSillMm', g('sillMm', 'sill'), label + ' sill') };
}
function add(p: Project, segs: Seg[], v: unknown, label: string) {
  const at = show(segs); const o = (v ?? {}) as Record<string, unknown>; if (typeof o !== 'object' || Array.isArray(o)) throw bad(`${label} needs an object value.`);
  const S = (k: string, max: number, def = '') => { const x = o[k] ?? def; if (typeof x !== 'string' || x.length > max) throw bad(`${label}: ${k} must be text up to ${max} characters.`); return x; };
  if (at === 'adu.rooms') {
    if (p.adu.rooms.length >= MAX_ROOMS) throw bad(`At most ${MAX_ROOMS} rooms.`);
    const use = (o.use ?? 'living') as Room['use']; if (!ROOM_USES.includes(use)) throw bad(`${label}: use must be one of ${ROOM_USES.join(', ')}.`);
    const rooms = addRoom(p, uid(), S('name', 60), use); const r = rooms[rooms.length - 1];
    if (o.poly !== undefined || o.w !== undefined || o.width !== undefined) {
      const shapeIn = o.poly ?? { w: o.w ?? o.width, d: o.d ?? o.depth, x: o.x, y: o.y };
      r.poly = poly(shapeIn, label + ' shape', { x: inch(4), y: inch(4) }); r.shape = Array.isArray(o.poly) ? 'poly' : 'rect';
      if (r.shape === 'rect') r.tape = { w: null, d: null };
      // Only rooms after the first one are carved out of a full-garage room by addRoom; a sized room keeps the others as they were.
      p.adu.rooms = [...p.adu.rooms, r];
    } else p.adu.rooms = rooms;
    if (o.ceiling !== undefined || o.ceilingMm !== undefined) r.ceilingMm = length('ceilingMm', o.ceiling ?? o.ceilingMm, label + ' ceiling');
    for (const [i, x] of (Array.isArray(o.openings) ? o.openings : []).entries()) r.openings.push(opening(r, x as Record<string, unknown>, `${label} opening ${i}`));
    return;
  }
  if (segs.length === 4 && segs[0] === 'adu' && segs[1] === 'rooms' && typeof segs[2] === 'number' && segs[3] === 'openings') {
    const r = p.adu.rooms[segs[2]]; if (!r) throw bad(`adu.rooms[${segs[2]}] does not exist.`); if (r.openings.length >= MAX_OPENINGS) throw bad(`At most ${MAX_OPENINGS} doors and windows per room.`);
    r.openings.push(opening(r, o, label)); return;
  }
  if (at === 'adu.windows') {
    if (p.adu.rooms.length) throw bad('This project has drawn rooms, so escape windows come from the rooms.', 'Add a window to a room instead: add adu.rooms[i].openings with kind "window".');
    if (p.adu.windows.length >= MAX_WINDOWS) throw bad(`At most ${MAX_WINDOWS} windows.`);
    const w: Window = { id: uid(), room: S('room', 60), sleeping: o.sleeping !== false, gradeFloor: o.gradeFloor !== false,
      clearWidthMm: o.clearWidth ?? o.clearWidthMm ? length('clearWidthMm', o.clearWidth ?? o.clearWidthMm, label + ' clear width') : null, clearHeightMm: o.clearHeight ?? o.clearHeightMm ? length('clearHeightMm', o.clearHeight ?? o.clearHeightMm, label + ' clear height') : null,
      sillMm: o.sill ?? o.sillMm ? length('sillMm', o.sill ?? o.sillMm, label + ' sill') : null };
    p.adu.windows.push(w); return;
  }
  if (at === 'markup.pins') {
    if (p.markup.pins.length >= MAX_PINS) throw bad(`At most ${MAX_PINS} review notes.`);
    const spot = defaultPinSpot(p); const pin: Pin = { id: uid(), n: nextPinNumber(p.markup.pins), x: o.x === undefined ? spot.x : length('x', o.x, label + ' x'), y: o.y === undefined ? spot.y : length('y', o.y, label + ' y'),
      comment: S('comment', 2000), status: 'open', author: S('author', 80), at: new Date().toISOString(), ...(o.ref ? { ref: S('ref', 40) } : {}) };
    if (!pin.comment.trim()) throw bad(`${label}: a review note needs a comment.`);
    p.markup.pins.push(pin); return;
  }
  if (at === 'markup.responses') {
    if (p.markup.responses.length >= MAX_RESPONSES) throw bad(`At most ${MAX_RESPONSES} correction items.`);
    const pinId = o.pinId === undefined ? undefined : S('pinId', 60); if (pinId && !p.markup.pins.some(x => x.id === pinId)) throw bad(`${label}: no review note has id ${pinId.slice(0, 60)}.`);
    const r: Response = { id: uid(), ref: S('ref', 40), text: S('text', 2000), response: S('response', 2000), sheet: S('sheet', 60), done: o.done === true, ...(pinId ? { pinId } : {}) };
    if (!r.text.trim()) throw bad(`${label}: a correction item needs its text.`);
    p.markup.responses.push(r); return;
  }
  if (at === 'dismissed') {
    const rule = RULES.find(r => r.id === o.ruleId); if (!rule) throw bad(`${label}: unknown rule id. Use an id from list_rules.`);
    if (!canDismiss(rule)) throw bad(`${rule.id} is a critical or health-and-safety check and can't be dismissed.`);
    const reason = S('reason', 300); if (reason.trim().length < 5) throw bad(`${label}: say why in a few words (reason).`);
    p.dismissed = [...p.dismissed.filter(d => d.ruleId !== rule.id), { ruleId: rule.id, reason, at: new Date().toISOString(), ruleVersion: rule.version }]; return;
  }
  if (at === 'site.streetEdges') { const i = Number(o.edge ?? v); const e = p.site.streetEdges ?? []; if (!Number.isInteger(i) || i < 0 || i >= p.site.lot.length) throw bad(`${label}: edge must be 0 to ${p.site.lot.length - 1}.`); if (!e.includes(i)) p.site.streetEdges = [...e, i].slice(0, 4); return; }
  throw bad(`Can't add to ${at}.`, 'add works on adu.rooms, adu.rooms[i].openings, adu.windows, markup.pins, markup.responses, dismissed and site.streetEdges.');
}
const REMOVABLE = /^(adu\.rooms|adu\.rooms\[\d+\]\.openings|adu\.windows|markup\.pins|markup\.responses|dismissed|site\.streetEdges)$/;

/** Apply ops to a copy. Throws a ToolError naming the first op that can't be used. */
export function applyOps(before: Project, ops: Op[]): { p: Project; log: string[] } {
  const p: Project = structuredClone(before); const log: string[] = [];
  ops.forEach((op, i) => {
    const label = `ops[${i}]`;
    try {
      switch (op.op) {
        case 'autofit': { const r = autoFit(p); if (!r.footprint) throw bad(r.why); p.adu.footprint = r.footprint; p.confirmed.adu = true; unmark(p, 'garage'); log.push('autofit: ADU placed to meet setbacks'); return; }
        case 'move': { const dx = length('x', op.dx, 'move dx', true), dy = length('y', op.dy, 'move dy', true); p.adu.footprint = p.adu.footprint.map(q => ({ x: q.x + dx, y: q.y + dy })); unmark(p, 'garage'); log.push(`move ADU by ${fmtFtIn(dx)}, ${fmtFtIn(dy)}`); return; }
        case 'letter': {
          if (typeof op.text !== 'string' || !op.text.trim() || op.text.length > 100_000) throw bad('Paste the correction letter text (up to 100,000 characters).');
          const items = parseLetter(op.text); if (!items.length) throw bad('No correction items were found in that text.', 'Numbered items like "1." or "III-F.1" are split into separate items.');
          const keep = op.replace ? [] : p.markup.responses; if (keep.length + items.length > MAX_RESPONSES) throw bad(`At most ${MAX_RESPONSES} correction items.`);
          p.markup.responses = [...keep, ...items.map(x => ({ id: uid(), ref: x.ref, text: x.text, response: '', sheet: '', done: false }))]; log.push(`correction letter: ${items.length} item(s) added`); return;
        }
        case 'parcel': { const r = applyParcel(p, op.fill); Object.assign(p, r.next); log.push(`parcel map: filled ${r.filled.join(', ') || 'nothing'}`); return; }
        case 'remove': {
          const segs = parsePath(op.path); const idx = segs[segs.length - 1]; const arrPath = show(segs.slice(0, -1));
          if (typeof idx !== 'number' || !REMOVABLE.test(arrPath)) throw bad(`Can't remove ${op.path}.`, 'remove takes an item of a list, like adu.rooms[1] or markup.pins[0].');
          const { parent, key } = walk(p, segs); const arr = parent as unknown as unknown[]; if (!Array.isArray(arr) || key as number >= arr.length) throw bad(`${op.path} does not exist.`);
          arr.splice(key as number, 1); log.push(`remove ${op.path}`); return;
        }
        case 'add': add(p, parsePath(op.path), op.value, label); log.push(`add to ${op.path}`); return;
        case 'set': {
          const segs = parsePath(op.path); const path = show(segs);
          if (path === 'adu.width' || path === 'adu.depth') { const fb = bbox(p.adu.footprint); const mm = length('aduSide', op.value, path, false);
            p.adu.footprint = path === 'adu.width' ? rect(fb.minX, fb.minY, mm, fb.maxY - fb.minY) : rect(fb.minX, fb.minY, fb.maxX - fb.minX, mm); p.confirmed.adu = true; unmark(p, 'garage'); log.push(`set ${path} = ${fmtFtIn(mm)}`); return; }
          const head = segs[0] as string;
          if (head === 'sheet') { const id = segs[1] as string; if (!CATALOG.some(c => c.id === id)) throw bad(`${id.slice(0, 20)} is not an LADBS sheet item.`, 'Use sheet_item ids from run_checks (items: "all").'); if (op.value === null) delete p.sheet[id]; else if (['yes', 'no', 'na'].includes(op.value as string)) p.sheet[id] = op.value as 'yes'; else throw bad(`sheet.${id} must be yes, no, na or null.`); log.push(`set sheet.${id} = ${String(op.value)}`); return; }
          if (head === 'docs') { const id = segs[1] as string; const c = CATALOG.find(x => x.id === id); if (!c || c.mode !== 'doc') throw bad(`${id.slice(0, 20)} is not a document item of the LADBS sheet.`); if (typeof op.value !== 'boolean') throw bad(`docs.${id} must be true (attached) or false.`); if (op.value) p.docs[id] = true; else delete p.docs[id]; log.push(`set docs.${id} = ${op.value}`); return; }
          if (head === 'modules') { const id = segs[1] as string; if (!MODULES.some(m => m.id === id)) throw bad(`Unknown module ${id.slice(0, 20)}. Modules: ${MODULES.map(m => m.id).join(', ')}.`); if (typeof op.value !== 'boolean') throw bad(`modules.${id} must be true or false.`); p.modules[id] = op.value; log.push(`set modules.${id} = ${op.value}`); return; }
          const key = segs[segs.length - 1];
          if (typeof key === 'number' || LOCKED.has(key)) throw bad(`${path} can't be set directly.`, typeof key === 'number' ? 'Set a field of the item, like adu.rooms[0].name.' : 'Use add/remove for lists; ids and file metadata are fixed.');
          const { parent } = walk(p, segs);
          if (!(key in parent) && !['legalDescription', 'pinId', 'ref'].includes(key as string)) throw bad(`${path} is not a field.`, 'get_project shows every field and its current value.');
          if (['site.lot', 'site.primary', 'adu.footprint'].includes(path) || (key === 'poly' && segs[1] === 'rooms')) {
            parent[key] = poly(op.value, path);
            if (key === 'poly') { const r = parent as unknown as Room; r.tape = { w: null, d: null }; r.shape = Array.isArray(op.value) ? 'poly' : 'rect'; }
          } else parent[key] = scalar(segs, key as string, parent[key], op.value, path);
          if (MAP_KEY[path]) unmark(p, MAP_KEY[path]);
          if (CONFIRM[path]) p.confirmed[CONFIRM[path]] = true;
          log.push(`set ${path}`); return;
        }
        default: throw bad(`Unknown op ${(op as { op: string }).op}.`, 'Ops: set, add, remove, move, autofit, letter.');
      }
    } catch (e) { if (e instanceof ToolError) { e.message = `${label} (${(op as { op: string }).op}${'path' in op ? ' ' + String(op.path).slice(0, 80) : ''}): ${e.message}`; } throw e; }
  });
  // The app's own file check must accept the result as-is: nothing repaired, nothing dropped.
  const back = migrate(JSON.parse(serialize(p)));
  if (back.repairNotes?.length) throw new ToolError('invalid_result', `The edited project would not open cleanly in the app (${back.repairNotes.join(', ')}).`, 'Undo the last change or use values in range.');
  const n = (q: Project) => [q.adu.rooms.length, q.adu.rooms.reduce((s, r) => s + r.openings.length, 0), q.adu.windows.length, q.markup.pins.length, q.markup.responses.length].join();
  if (n(back) !== n(p)) throw new ToolError('invalid_result', 'Part of the edit would be dropped when the app opens the file (a room shape, opening or note is invalid).', 'Check opening walls and offsets, room corners and note positions.');
  const fb = bbox(p.adu.footprint); if (fb.maxX - fb.minX < ft(6) || fb.maxY - fb.minY < ft(6) || fb.maxX - fb.minX > ft(200) || fb.maxY - fb.minY > ft(200)) throw new ToolError('invalid_result', 'The ADU must be 6\' to 200\' on each side.');
  return { p: back, log };
}
