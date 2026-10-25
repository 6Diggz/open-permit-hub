/// <reference types="node" />
// Parity features: parcel autofill (recorded fixtures only, never live APIs), room drawing, review markup.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { blankProject, demoProject, uid, type Project, type Room } from '../core/model';
import { evaluate } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { lookupParcel, splitAddress, houseKey, fmtApn, ringToLot, type FetchLike, PARCEL_SOURCES } from '../io/parcel';
import { applyParcel, unmark, fromMap } from '../io/parcel-apply';
import { addCorner, addRoom, overlappingRooms, applyTape, newRoom, roomFits, roomSize, withRooms, footLocal, openingProblems, clampMove } from '../core/rooms';
import { rect, bbox, area, polyInside } from '../core/geom';
import { ft, inch, toSqFt } from '../core/units';
import { migrate, serialize, MAX_PINS } from '../core/permitpack';
import { parseLetter, responseLetter, sortPins, nextPinNumber } from '../core/markup';
import { sheetsPDF } from '../out/pdf';
import { toDXF, toDXFR12, sitePlanSpec } from '../out/dxf';
import { initCleanfix } from './wasm';
import { PDFDocument } from 'pdf-lib';

type Rec = { address: string; calls: Record<string, { status: number; body: unknown }> };
const fx = (n: string): Rec => JSON.parse(readFileSync(new URL(`./fixtures/parcel/${n}.json`, import.meta.url), 'utf8'));
/** Replays recorded answers. Any URL not recorded fails the test, so a test can never reach a live service. */
function replay(rec: Rec, patch: (url: string, body: any) => any = (_u, b) => b, fail?: (url: string) => number | 'throw' | null): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(url); const why = fail?.(url); if (why === 'throw') throw new TypeError('Failed to fetch');
    if (typeof why === 'number') return { ok: false, status: why, json: async () => ({}) };
    const hit = rec.calls[url]; if (!hit) throw new Error('unrecorded URL ' + url);
    const body = patch(url, structuredClone(hit.body)); return { ok: hit.status < 400, status: hit.status, json: async () => body };
  }) as FetchLike & { urls: string[] };
  f.urls = urls; return f;
}
const st = (p: Project, id: string) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).results.find(r => r.rule.id === id)?.status;
const realFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = (() => { throw new Error('live network call in a test'); }) as never; });
afterAll(() => { globalThis.fetch = realFetch; });

describe('parcel autofill (recorded fixtures)', () => {
  it('fills APN, zone, city, lot lines and overlays for an Atwater lot', async () => {
    const r = await lookupParcel(fx('atwater').address, { fetch: replay(fx('atwater')) });
    expect(r.ok).toBe(true); if (!r.ok) return; const f = r.fill;
    expect(f.apn).toBe('5594-014-021'); expect(f.zone).toBe('R1-1-RIO'); expect(f.jurisdiction).toBe('la-city');
    expect(f.flags).toEqual({ hillside: 'no', vhfhsz: 'no', coastal: 'no', hpoz: 'no' }); expect(f.failed).toEqual([]);
    expect(Math.abs(f.widthMm! - ft(40))).toBeLessThan(ft(0.5)); expect(Math.abs(f.depthMm! - ft(140))).toBeLessThan(ft(0.5));
    const lot = f.lot!; expect(lot[0].y).toBeCloseTo(0, 0); expect(Math.abs(lot[1].y - lot[0].y)).toBeLessThan(1); // street edge first, along +x
    expect(lot.reduce((s, p, i) => { const q = lot[(i + 1) % lot.length]; return s + p.x * q.y - q.x * p.y; }, 0)).toBeGreaterThan(0); // counter-clockwise
  });
  it('Venice lot is in the Coastal Zone; Nichols Canyon is Hillside and Very High Fire; Carroll Ave is HPOZ', async () => {
    const v = await lookupParcel(fx('venice').address, { fetch: replay(fx('venice')) }); expect(v.ok && v.fill.flags.coastal).toBe('yes');
    const n = await lookupParcel(fx('nichols').address, { fetch: replay(fx('nichols')) }); expect(n.ok && n.fill.flags.hillside).toBe('yes'); expect(n.ok && n.fill.flags.vhfhsz).toBe('yes');
    if (n.ok) expect(n.fill.lot!.length).toBeLessThan(30); // curved lines simplified
    const h = await lookupParcel(fx('hpoz').address, { fetch: replay(fx('hpoz')) }); expect(h.ok && h.fill.flags.hpoz).toBe('yes'); expect(h.ok && h.fill.zone).toContain('HPOZ');
  });
  it('unknown address and wrong ZIP -> not found, nothing filled', async () => {
    expect(await lookupParcel(fx('notfound').address, { fetch: replay(fx('notfound')) })).toEqual({ ok: false, error: 'not-found' });
    expect((await lookupParcel(fx('zipwrong').address, { fetch: replay(fx('zipwrong')) })).ok).toBe(false);
  });
  it('offline and empty address never call the network', async () => {
    const f = replay(fx('atwater'));
    expect(await lookupParcel('4305 Edenhurst Ave', { fetch: f, online: false })).toEqual({ ok: false, error: 'offline' });
    expect(await lookupParcel('Edenhurst Ave', { fetch: f })).toEqual({ ok: false, error: 'empty' });
    expect(f.urls.length).toBe(0);
  });
  it('a failed geocoder is a network error; a failed layer leaves only that field blank', async () => {
    expect((await lookupParcel(fx('atwater').address, { fetch: replay(fx('atwater'), undefined, () => 'throw') }))).toMatchObject({ ok: false, error: 'network' });
    const r = await lookupParcel(fx('atwater').address, { fetch: replay(fx('atwater'), undefined, u => (u.startsWith(PARCEL_SOURCES.zoning.url) ? 503 : null)) });
    expect(r.ok).toBe(true); if (!r.ok) return; expect(r.fill.failed).toEqual(['zoning']); expect(r.fill.zone).toBe(''); expect(r.fill.apn).toBe('5594-014-021');
  });
  it('real city boundary: outside LA City -> other city, with its name', async () => {
    const r = await lookupParcel(fx('atwater').address, { fetch: replay(fx('atwater'), (u, b) => {
      if (u.startsWith(PARCEL_SOURCES.city.url)) b.features = [];
      if (u.startsWith(PARCEL_SOURCES.adjacent.url)) b.features = [{ attributes: { CITYNAME: 'GLENDALE' } }];
      return b; }) });
    expect(r.ok && r.fill.jurisdiction).toBe('other'); expect(r.ok && r.fill.cityName).toBe('GLENDALE');
    const { next } = applyParcel(blankProject(), (r as any).fill); expect(st(next, 'JUR-01')).not.toBe('PASS'); expect(evaluate(next, RULES, PACK_ID).overall).toBe('NOT_SUPPORTED');
  });
  it('never guesses a neighbor: no exact house-number match -> no lot shape, overlays unknown', async () => {
    const r = await lookupParcel(fx('atwater').address, { fetch: replay(fx('atwater'), (u, b) => { if (u.startsWith(PARCEL_SOURCES.parcel.url)) b.features.forEach((f: any) => { f.attributes.TOOLTIP = '9999 X ST'; }); return b; }) });
    expect(r.ok).toBe(true); if (!r.ok) return; expect(r.fill.lot).toBeNull(); expect(r.fill.apn).toBe(''); expect(r.fill.flags.hillside).toBe('unknown'); expect(r.fill.failed).toContain('parcel');
  });
  it('a cancelled lookup throws AbortError (the screen goes back to idle)', async () => {
    const c = new AbortController(); c.abort();
    const f: FetchLike = async (_u, i) => { if (i?.signal?.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } throw new Error('x'); };
    await expect(lookupParcel(fx('atwater').address, { fetch: f, signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('helpers: address split, house key, APN format, ring orientation', () => {
    expect(splitAddress('4305 Edenhurst Ave, Los Angeles, CA 90039')).toEqual({ street: '4305 Edenhurst Ave', zip: '90039' });
    expect(splitAddress('12 Main St Apt 4')).toEqual({ street: '12 Main St', zip: '' });
    expect(houseKey('U4302 N EDENHURST AVE ')).toBe('4302 edenhurst'); expect(houseKey('4302 W Edenhurst Ave, 90039')).toBe('4302 edenhurst');
    expect(fmtApn('4235023010')).toBe('4235-023-010');
    const lot = ringToLot([[-118.0, 34.0], [-118.0, 34.0003], [-117.9997, 34.0003], [-117.9997, 34.0], [-118.0, 34.0]], { x: -117.99985, y: 33.9999 });
    expect(lot.length).toBe(4); expect(Math.min(...lot.map(p => p.y))).toBeCloseTo(0, 0);
  });
  it('applying a fill tags each value, moves placeholder buildings inside a narrow lot, and an edit removes the tag', async () => {
    const r = await lookupParcel(fx('venice').address, { fetch: replay(fx('venice')) }); if (!r.ok) throw new Error('fixture');
    const p = blankProject(); p.site.address = fx('venice').address;
    const { next, filled } = applyParcel(p, r.fill);
    expect(filled).toEqual(expect.arrayContaining(['lot', 'apn', 'zone', 'jurisdiction', 'coastal']));
    expect(next.site.lotSource).toBe('gis'); expect(fromMap(next, 'apn')).toBe(true);
    expect(polyInside(next.adu.footprint, next.site.lot)).toBe(true); expect(polyInside(next.site.primary, next.site.lot)).toBe(true);
    expect(st(next, 'JUR-01')).toBe('PASS'); expect(st(next, 'HAZ-03')).toBe('INFO');
    unmark(next, 'apn'); expect(fromMap(next, 'apn')).toBe(false);
    const back = migrate(JSON.parse(serialize(next))); expect(back.site.parcel?.fromMap).not.toContain('apn'); expect(back.site.zone).toBe('RD1.5-1-O');
  });
});

const room = (p: Project, name: string, use: Room['use'], x: number, y: number, w: number, d: number): Room => ({ ...newRoom(p, uid(), name, use), poly: rect(x, y, w, d) });
const win = (wall: number, w = inch(24), h = inch(36), sill = inch(40)) => ({ id: uid(), kind: 'window' as const, wall, offsetMm: inch(12), widthMm: w, heightMm: h, sillMm: sill });
const door = (wall: number, w = inch(32)) => ({ id: uid(), kind: 'door' as const, wall, offsetMm: inch(6), widthMm: w, heightMm: inch(80), sillMm: null });

describe('room drawing feeds the rules', () => {
  const base = () => { const p = demoProject(); p.adu.windows = []; p.adu.bedrooms = 3; return p; }; // 20x20 footprint
  it('each sleeping room needs its own escape window; drawn rooms replace the typed bedroom count', () => {
    const p = base(); const b1 = room(p, 'Bedroom', 'sleeping', inch(4), inch(4), ft(10), ft(10)), b2 = room(p, 'Bedroom', 'sleeping', ft(10.5), inch(4), ft(9), ft(10));
    b1.openings.push(win(3), door(1)); b2.openings.push(door(3)); p.adu.rooms = [b1, b2];
    expect(withRooms(p).adu.bedrooms).toBe(2);
    expect(st(p, 'EGR-01')).toBe('UNKNOWN'); // second bedroom (same name) has no window: counted separately
    b2.openings.push(win(1)); expect(st(p, 'EGR-01')).toBe('PASS');
    b2.openings[1] = win(1, inch(18)); expect(st(p, 'EGR-01')).toBe('FAIL');
  });
  it('a studio counts as one room, and still needs its escape window even if nobody sleeps there', () => {
    const p = base(); const m = room(p, 'Main', 'living', inch(4), inch(4), ft(19), ft(12)), b = room(p, 'Bath', 'bath', inch(4), ft(12.5), ft(8), ft(7));
    m.openings.push(door(0)); p.adu.rooms = [m, b];
    expect(withRooms(p).adu.bedrooms).toBe(0); expect(st(p, 'EGR-01')).toBe('UNKNOWN');
    m.openings.push(win(3)) /* left wall: outside (the back wall faces the garage interior) */; expect(st(p, 'EGR-01')).toBe('PASS');
    p.adu.mainRoomSleeping = 'no'; expect(st(p, 'EGR-01')).toBe('PASS'); m.openings = m.openings.filter(o => o.kind === 'door'); expect(st(p, 'EGR-01')).toBe('UNKNOWN');
  });
  it('ceiling is checked per room; bathrooms need 7\' 0" too (LADBS III-G.1)', () => {
    const p = base(); const m = room(p, 'Main', 'living', inch(4), inch(4), ft(12), ft(12)), b = room(p, 'Bath', 'bath', ft(13), inch(4), ft(6), ft(8));
    p.adu.rooms = [m, b]; p.adu.ceilingHeightMm = inch(85); b.ceilingMm = inch(81); expect(st(p, 'CEI-01')).toBe('FAIL'); b.ceilingMm = inch(84); expect(st(p, 'CEI-01')).toBe('PASS');
    m.ceilingMm = inch(83); expect(st(p, 'CEI-01')).toBe('FAIL');
    m.ceilingMm = null; p.adu.ceilingHeightMm = null; expect(st(p, 'CEI-01')).toBe('UNKNOWN');
  });
  it('ROM-01: outside the garage, too small, narrow door, no doors', () => {
    const p = base(); const m = room(p, 'Main', 'living', inch(4), inch(4), ft(12), ft(12)); p.adu.rooms = [m];
    expect(st(p, 'ROM-01')).toBe('UNKNOWN'); m.openings.push(door(0)); expect(st(p, 'ROM-01')).toBe('PASS');
    m.openings[0] = door(0, inch(28)); expect(st(p, 'ROM-01')).toBe('FAIL'); m.openings[0] = door(0);
    m.poly = rect(ft(15), 0, ft(10), ft(10)); expect(st(p, 'ROM-01')).toBe('FAIL');
    m.poly = rect(0, 0, ft(6), ft(10)); expect(st(p, 'ROM-01')).toBe('FAIL');
    expect(st(blankProject(), 'ROM-01')).toBeUndefined();
  });
  it('adding a room splits a room that fills the garage; overlapping rooms are flagged, shared walls are not', () => {
    const p = base(); p.adu.rooms = addRoom(p, 'a', 'Main', 'living'); expect(roomFits(p.adu.rooms[0].poly, footLocal(p))).toBe(true);
    p.adu.rooms = addRoom(p, 'b', 'Bed', 'sleeping'); expect(p.adu.rooms.length).toBe(2); expect(overlappingRooms(p.adu.rooms)).toEqual([]);
    p.adu.rooms.forEach(r => expect(roomFits(r.poly, footLocal(p))).toBe(true));
    const a = room(p, 'A', 'living', 0, 0, ft(10), ft(10)), b = room(p, 'B', 'living', ft(10), 0, ft(8), ft(10)), c = room(p, 'C', 'living', ft(5), ft(5), ft(8), ft(8));
    expect(overlappingRooms([a, b])).toEqual([]); expect(overlappingRooms([a, b, c]).length).toBe(2);
    p.adu.rooms = [a, c]; a.openings.push(door(0)); expect(st(p, 'ROM-01')).toBe('FAIL');
  });
  it('tape-measured sizes override the drawing', () => {
    const p = base(); const r = room(p, 'Bed', 'sleeping', 0, 0, ft(10), ft(10)); r.tape.w = ft(11) + inch(3);
    const t = applyTape(r); expect(roomSize(t)).toMatchObject({ w: ft(11) + inch(3), d: ft(10), taped: true }); expect(bbox(t.poly).maxX).toBeCloseTo(ft(11.25));
  });
  it('geometry: rooms sharing the garage wall fit; moves are clamped; adding a corner keeps openings on their walls', () => {
    const p = base(); const foot = footLocal(p); expect(roomFits(rect(0, 0, ft(20), ft(20)), foot)).toBe(true); expect(roomFits(rect(0, 0, ft(21), ft(20)), foot)).toBe(false);
    expect(bbox(clampMove(rect(0, 0, ft(5), ft(5)), foot, ft(30), 0)).maxX).toBeCloseTo(ft(20));
    const r = room(p, 'R', 'living', 0, 0, ft(10), ft(8)); r.openings.push(win(2)); const c = addCorner(r);
    expect(c.shape).toBe('poly'); expect(c.poly.length).toBe(5); expect(area(c.poly)).toBeCloseTo(area(r.poly)); expect(c.openings[0].wall).toBe(3);
    r.openings.push({ ...win(2), offsetMm: ft(9.5) }); expect(openingProblems(r).length).toBeGreaterThan(0);
    expect(toSqFt(area(r.poly))).toBeCloseTo(80);
  });
});

describe('review markup and .permitpack', () => {
  it('pins and correction responses travel in the pack; damaged ones are dropped, counts capped', () => {
    const p = demoProject(); p.markup.pins.push({ id: uid(), n: 1, x: ft(30), y: ft(110), comment: 'Show the 1-hr wall', status: 'open', author: 'Plan checker', at: '2026-10-24' });
    p.markup.responses.push({ id: uid(), ref: '3', text: 'Provide smoke alarms', response: 'Added on A-2', sheet: 'A-2', done: true });
    const back = migrate(JSON.parse(serialize(p))); expect(back.markup.pins[0]).toMatchObject({ n: 1, comment: 'Show the 1-hr wall', author: 'Plan checker', status: 'open' }); expect(back.markup.responses[0].done).toBe(true);
    const j = JSON.parse(serialize(p)); j.markup.pins.push({ x: 'nope' }, { id: 'x', x: 1, y: 2, status: 'weird', comment: 'x'.repeat(5000) });
    j.adu.rooms = [{ poly: 'bad' }, { ...newRoom(p, 'r1', 'A', 'kitchen'), use: 'garage', openings: [{ kind: 'door', wall: 99, widthMm: 800, offsetMm: 0 }] }];
    const m = migrate(j); expect(m.markup.pins.length).toBe(2); expect(m.markup.pins[1].status).toBe('open'); expect(m.markup.pins[1].comment.length).toBe(2000);
    expect(m.adu.rooms.length).toBe(1); expect(m.adu.rooms[0].use).toBe('living'); expect(m.adu.rooms[0].openings.length).toBe(0); expect(m.repairNotes).toContain('a room shape or size');
    const big = JSON.parse(serialize(p)); big.markup.pins = Array.from({ length: MAX_PINS + 20 }, (_, i) => ({ id: 'p' + i, n: i + 1, x: 0, y: 0, comment: '', status: 'open', author: '', at: '' }));
    expect(migrate(big).markup.pins.length).toBe(MAX_PINS);
    const old = JSON.parse(serialize(blankProject())); delete old.markup; delete old.adu.rooms; delete old.site.zone; delete old.site.parcel;
    const o = migrate(old); expect(o.markup).toEqual({ pins: [], responses: [] }); expect(o.adu.rooms).toEqual([]); expect(o.site.zone).toBe('');
  });
  it('correction letter splits into items (numbers, sheet refs, wrapped lines, footers)', () => {
    const t = `1. Show the fire-rated wall on the
north side.
2) Provide window schedule.
Page 2 of 3
III-F.1 Escape window size.
(4) Smoke alarms in each bedroom.`;
    const it = parseLetter(t); expect(it.map(i => i.ref)).toEqual(['1', '2', 'III-F.1', '4']); expect(it[0].text).toBe('Show the fire-rated wall on the north side.');
    expect(parseLetter('Fix the setback.\n\nAdd the engineer stamp.').map(i => i.text)).toEqual(['Fix the setback.', 'Add the engineer stamp.']);
    expect(parseLetter('   ')).toEqual([]);
  });
  it('sortable list, next number, response letter', () => {
    const pins = [{ id: 'a', n: 2, x: 0, y: 0, comment: 'b', status: 'resolved' as const, author: 'Z', at: '2026-01-02' }, { id: 'b', n: 1, x: 0, y: 0, comment: 'a', status: 'open' as const, author: 'A', at: '2026-01-03' }];
    expect(sortPins(pins, 'n', 1).map(x => x.n)).toEqual([1, 2]); expect(sortPins(pins, 'status', 1)[0].status).toBe('open'); expect(sortPins(pins, 'at', -1)[0].id).toBe('b');
    expect(nextPinNumber(pins)).toBe(3); expect(nextPinNumber([])).toBe(1);
    const p = demoProject(); p.markup.responses.push({ id: 'r', ref: '7', text: 'Show the eave', response: 'Added', sheet: 'A-1', done: false });
    const l = responseLetter(p); expect(l).toContain('7. Show the eave'); expect(l).toContain('Response: Added'); expect(responseLetter(p, true)).toContain('Respuesta: Added');
  });
});

describe('outputs with rooms and markup', () => {
  const full = () => { const p = demoProject(); const r = room(p, 'Bedroom', 'sleeping', inch(4), inch(4), ft(10), ft(10)); r.openings.push(win(3), door(1)); p.adu.rooms = [r];
    p.markup.pins.push({ id: uid(), n: 1, x: ft(35), y: ft(115), comment: 'Check eave', status: 'open', author: 'Ana', at: '2026-10-24' }); p.site.zone = 'R1-1'; return p; };
  it('PDF: A-2 draws rooms and the markup sheet is added', async () => {
    const d = await PDFDocument.load(await sheetsPDF(full(), 'draft')); expect(d.getPageCount()).toBe(3);
    expect((await PDFDocument.load(await sheetsPDF(demoProject(), 'draft'))).getPageCount()).toBe(2);
  });
  it('DXF: rooms, doors, windows and review notes on their own layers (2018 and R12)', async () => {
    const p = full(); const spec = sitePlanSpec(p);
    expect(spec.outlines.map(o => o.layer)).toEqual(expect.arrayContaining(['A-AREA', 'A-DOOR', 'A-GLAZ'])); expect(spec.texts.some(t => t.layer === 'G-ANNO-REDL' && t.text.includes('[1] Check eave'))).toBe(true);
    const r12 = toDXFR12(p); for (const l of ['A-AREA', 'A-AREA-IDEN', 'A-GLAZ', 'G-ANNO-REDL']) expect(r12).toContain(l); expect(r12).toContain('BEDROOM');
    initCleanfix(); const d = new TextDecoder().decode(await toDXF(p)); expect(d).toContain('A-AREA'); expect(d).toContain('ZONE R1-1');
  });
});
