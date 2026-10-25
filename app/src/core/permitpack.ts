import { FORMAT, FORMAT_VERSION, type Project, blankProject, blankCounty, uid, UUID_RE } from './model';
import { isNum, MAX_LEN_MM } from './units';
import type { Poly } from './geom';
import { MAX_ROOMS, MAX_OPENINGS, MAX_ROOM_PTS } from './rooms';
import { ROOM_USES, type Room, type Pin, type Response } from './model';
import { sanitizeInspection, sanitizePhotos } from './inspection';
import { stagePhotos } from './photos';

export const MAX_PINS = 500, MAX_RESPONSES = 500;

/** Packs larger than this are refused before parsing (a real project is a few KB). */
export const MAX_PACK_BYTES = 5 * 1024 * 1024;
/** A backup-all file holds up to 500 projects; each one inside is still held to MAX_PACK_BYTES. */
export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
/** More windows than this is not a garage ADU; extra ones are dropped on open. */
export const MAX_WINDOWS = 50;

/** Versioned file format with forward migrations (UU025-family, semver + migrations). */
const MIGRATIONS: Record<number, (p: any) => any> = {
  // 1 -> 2 example slot; v1 is current.
};

const okPoly = (x: any): x is Poly => Array.isArray(x) && x.length >= 3 && x.length <= 1000 && x.every((q: any) => q && isNum(q.x) && isNum(q.y) && Math.abs(q.x) < 1e12 && Math.abs(q.y) < 1e12);
const numOrNull = (v: any, max = Infinity) => (isNum(v) && v >= 0 && v <= max ? v : null);
const str = (v: any, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
const tri = (v: any) => (v === 'yes' || v === 'no' || v === 'unknown' ? v : 'unknown');

/**
 * Open any stored or shared project. Never trusts the file: every number must be finite and in range,
 * every shape must be valid. Broken parts are repaired (reset to a placeholder the user must re-enter)
 * and listed in `repairNotes`, instead of bricking the project.
 */
export function migrate(raw: any): Project {
  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) throw new Error('This file is not a permit pack.');
  if (typeof raw.version !== 'number' || raw.version > FORMAT_VERSION)
    throw new Error(`This pack was made by a newer version (v${raw.version}). Update the app to open it.`);
  let p = raw; while (p.version < FORMAT_VERSION) { const m = MIGRATIONS[p.version]; if (!m) throw new Error(`This pack is from an unsupported version (v${p.version}).`); p = m(p); }
  if (!p.site || typeof p.site !== 'object' || !p.adu || typeof p.adu !== 'object') throw new Error('This pack is damaged: the drawing data is missing or invalid.');
  const base = blankProject(); const notes: string[] = [];
  const out: Project = {
    ...base, ...p,
    site: { ...base.site, ...p.site, flags: { ...base.site.flags, ...p.site?.flags } },
    adu: { ...base.adu, ...p.adu }, people: { ...base.people, ...p.people }, modules: { ...base.modules, ...p.modules },
    sheet: { ...(p.sheet ?? {}) }, docs: { ...(p.docs ?? {}) }, confirmed: { lot: true, house: true, adu: true, ...p.confirmed },
    dismissed: Array.isArray(p.dismissed) ? p.dismissed.filter((d: any) => d && typeof d.ruleId === 'string').map((d: any) => ({ ruleId: str(d.ruleId, 20), reason: str(d.reason, 300), at: str(d.at, 40), ruleVersion: str(d.ruleVersion, 10) })) : [],
  };
  // Identity: a shared file could carry any id; it is also a storage key and a calendar UID.
  if (typeof out.id !== 'string' || !UUID_RE.test(out.id)) { out.id = uid(); }
  out.name = str(out.name, 120) || base.name;
  // Shapes: repair instead of refusing (old saves could hold Infinity, stored by JSON as null).
  if (!okPoly(out.site.lot)) { out.site.lot = base.site.lot; out.confirmed.lot = false; notes.push('lot size'); }
  if (!okPoly(out.site.primary)) { out.site.primary = base.site.primary; out.confirmed.house = false; notes.push('house size and position'); }
  if (!okPoly(out.adu.footprint)) { out.adu.footprint = base.adu.footprint; out.confirmed.adu = false; notes.push('garage size and position'); }
  if (!Number.isInteger(out.site.streetEdge) || out.site.streetEdge < 0 || out.site.streetEdge >= out.site.lot.length) out.site.streetEdge = 0;
  out.site.streetEdges = Array.isArray(out.site.streetEdges) ? [...new Set(out.site.streetEdges.filter((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < out.site.lot.length))].slice(0, 4) as number[] : [];
  // Numbers: finite and in range, or reset.
  const fix = <T,>(label: string, v: any, ok: (x: any) => boolean, dflt: T): T => { if (v === null || v === undefined) return dflt; if (ok(v)) return v; notes.push(label); return dflt; };
  const len = (x: any) => isNum(x) && x >= 0 && x <= MAX_LEN_MM;
  const a = out.adu, s = out.site;
  a.heightMm = fix('overall height', a.heightMm, x => len(x) && x > 0, base.adu.heightMm);
  a.ceilingHeightMm = fix('ceiling height', a.ceilingHeightMm, len, null);
  a.eaveDepthMm = fix('eave depth', a.eaveDepthMm, len, null);
  a.addedSetbackMm = fix('added area setback', a.addedSetbackMm, len, null);
  a.floorPlanSideSetbackMm = fix('floor plan side setback', a.floorPlanSideSetbackMm, len, null);
  a.floorPlanRearSetbackMm = fix('floor plan rear setback', a.floorPlanRearSetbackMm, len, null);
  a.hosePullFt = fix('hose pull distance', a.hosePullFt, x => isNum(x) && x >= 0 && x <= 100000, null);
  a.interiorLivableSqFt = fix('livable area', a.interiorLivableSqFt, x => isNum(x) && x >= 0 && x <= 1e6, null);
  a.addedAreaSqFt = fix('added area', a.addedAreaSqFt, x => isNum(x) && x >= 0 && x <= 1e6, 0);
  a.panelAmps = fix('panel size', a.panelAmps, x => isNum(x) && x >= 0 && x <= 10000, null);
  a.bedrooms = fix('bedrooms', a.bedrooms, x => Number.isInteger(x) && x >= 0 && x <= 20, base.adu.bedrooms);
  s.lotUncertaintyMm = fix('lot line uncertainty', s.lotUncertaintyMm, len, base.site.lotUncertaintyMm);
  s.northDeg = fix('north direction', s.northDeg, x => isNum(x) && x >= 0 && x < 360, null);
  s.primaryHeightMm = fix('house height', s.primaryHeightMm, len, base.site.primaryHeightMm);
  s.existingAdus = numOrNull(s.existingAdus, 100); s.existingJadus = numOrNull(s.existingJadus, 100);
  s.address = str(s.address); s.apn = str(s.apn, 40); s.legalDescription = str(s.legalDescription, 300);
  for (const k of Object.keys(base.site.flags) as (keyof typeof base.site.flags)[]) s.flags[k] = tri(s.flags[k]);
  s.otherBuildings = tri(s.otherBuildings); s.existingAduAttached = tri(s.existingAduAttached); s.otherBuildingGapMm = fix('distance to other buildings', s.otherBuildingGapMm, len, null);
  s.jurisdictionConfirmed = s.jurisdictionConfirmed === true;
  // OUT-15: County beta answers, typed and in range, or reset.
  if (s.county !== undefined) { const c: any = s.county && typeof s.county === 'object' ? s.county : {}; const b = blankCounty();
    const ftv = (label: string, v: any, hi: number) => fix(label, v, x => isNum(x) && x >= 0 && x <= hi, null);
    s.county = { betaOptIn: c.betaOptIn === true, fireFlowGpm: ftv('fire flow', c.fireFlowGpm, 100000), hydrantFt: ftv('hydrant distance', c.hydrantFt, 100000),
      vehicleAccessFt: ftv('vehicle access distance', c.vehicleAccessFt, 100000), roadWidthFt: ftv('access road width', c.roadWidthFt, 1000), roadGradeOk: tri(c.roadGradeOk ?? b.roadGradeOk),
      pathWidthFt: ftv('access path width', c.pathWidthFt, 1000), pathGradeOk: tri(c.pathGradeOk ?? b.pathGradeOk), faultZone: tri(c.faultZone ?? b.faultZone) }; }
  if (!['la-city', 'la-county', 'other', 'unknown'].includes(s.jurisdiction)) s.jurisdiction = 'unknown';
  a.garageConstruction = (['wood', 'masonry', 'concrete', 'unknown'] as const).includes(a.garageConstruction) ? a.garageConstruction : 'unknown';
  a.ratedEaveUndersidePlanned = tri(a.ratedEaveUndersidePlanned);
  a.newUpperFloor = tri(a.newUpperFloor);
  a.houseFacingOpenings = tri(a.houseFacingOpenings); a.houseWallRated = tri(a.houseWallRated);
  // People and dates: every field typed and capped (a non-string name crashed the PDF export).
  const pe = out.people;
  pe.ownerName = str(pe.ownerName, 120); pe.preparerName = str(pe.preparerName, 120); pe.engineerName = str(pe.engineerName, 120); pe.preparerLicense = str(pe.preparerLicense, 40);
  if (!['owner', 'drafter', 'contractor', 'architect', 'engineer'].includes(pe.preparerRole)) pe.preparerRole = 'owner';
  if (pe.language !== 'en' && pe.language !== 'es') pe.language = 'en';
  out.applicationDate = typeof out.applicationDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out.applicationDate) ? out.applicationDate : null;
  out.rulePack = str(out.rulePack, 40);
  if (out.dismissed.length > 300) out.dismissed = out.dismissed.slice(0, 300);
  // Windows: cap the count, sanitize every number.
  if (!Array.isArray(a.windows)) a.windows = [];
  if (a.windows.length > MAX_WINDOWS) { a.windows = a.windows.slice(0, MAX_WINDOWS); notes.push(`windows over ${MAX_WINDOWS}`); }
  let badWin = false;
  a.windows = a.windows.filter((w: any) => w && typeof w === 'object').map((w: any) => {
    const n = (v: any) => { if (v == null) return null; if (len(v)) return v; badWin = true; return null; };
    return { id: str(w.id, 60) || uid(), room: str(w.room, 60), sleeping: !!w.sleeping, gradeFloor: !!w.gradeFloor, clearWidthMm: n(w.clearWidthMm), clearHeightMm: n(w.clearHeightMm), sillMm: n(w.sillMm) };
  });
  if (badWin) notes.push('a window size');
  // Zoning and parcel source (from the city map, or typed).
  s.zone = str(s.zone, 40);
  const pc = s.parcel as any;
  s.parcel = pc && typeof pc === 'object' ? { at: str(pc.at, 40), matched: str(pc.matched, 120), cityName: str(pc.cityName, 60), pin: str(pc.pin, 40),
    fromMap: Array.isArray(pc.fromMap) ? pc.fromMap.filter((k: any) => typeof k === 'string').slice(0, 20).map((k: string) => k.slice(0, 20)) : [],
    failed: Array.isArray(pc.failed) ? pc.failed.filter((k: any) => typeof k === 'string').slice(0, 20).map((k: string) => k.slice(0, 30)) : [] } : null;
  // Rooms: cap counts, valid shapes and sizes, known uses. A broken room is dropped and listed.
  if (!Array.isArray(a.rooms)) a.rooms = [];
  let badRoom = false;
  const nn = (v: any) => (v == null ? null : len(v) ? v : (badRoom = true, null));
  a.rooms = (a.rooms as any[]).slice(0, MAX_ROOMS).filter(r => { const ok = r && typeof r === 'object' && okPoly(r.poly) && r.poly.length <= MAX_ROOM_PTS; if (!ok) badRoom = true; return ok; }).map((r: any): Room => ({
    id: str(r.id, 60) || uid(), name: str(r.name, 60), use: ROOM_USES.includes(r.use) ? r.use : 'living', shape: r.shape === 'poly' ? 'poly' : 'rect',
    poly: r.poly.map((q: any) => ({ x: q.x, y: q.y })), tape: { w: nn(r.tape?.w), d: nn(r.tape?.d) }, ceilingMm: nn(r.ceilingMm),
    openings: (Array.isArray(r.openings) ? r.openings : []).slice(0, MAX_OPENINGS).filter((o: any) => o && typeof o === 'object' && Number.isInteger(o.wall) && o.wall >= 0 && o.wall < r.poly.length && len(o.widthMm) && o.widthMm > 0 && isNum(o.offsetMm) && Math.abs(o.offsetMm) <= MAX_LEN_MM)
      .map((o: any) => ({ id: str(o.id, 60) || uid(), kind: o.kind === 'door' ? 'door' : 'window', wall: o.wall, offsetMm: o.offsetMm, widthMm: o.widthMm, heightMm: nn(o.heightMm), sillMm: nn(o.sillMm) })),
  }));
  if ((p.adu?.rooms?.length ?? 0) > MAX_ROOMS) notes.push(`rooms over ${MAX_ROOMS}`);
  if (badRoom) notes.push('a room shape or size');
  // Review markup: pins and correction responses travel in the pack (reviewers need no account).
  const mk = (p.markup && typeof p.markup === 'object') ? p.markup : {};
  // A pin is kept only near the drawing (lot box plus 100 ft); one far off would blow up DXF extents and fall off the G-2 sheet.
  const lb = out.site.lot.reduce((b, v) => ({ x0: Math.min(b.x0, v.x), x1: Math.max(b.x1, v.x), y0: Math.min(b.y0, v.y), y1: Math.max(b.y1, v.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const PAD = 30480, near = (x: any) => x.x >= lb.x0 - PAD && x.x <= lb.x1 + PAD && x.y >= lb.y0 - PAD && x.y <= lb.y1 + PAD;
  const rawPins: any[] = Array.isArray(mk.pins) ? mk.pins : [];
  if (rawPins.length > MAX_PINS) notes.push(`review notes over ${MAX_PINS}`);
  const okPins = rawPins.slice(0, MAX_PINS).filter((x: any) => x && isNum(x.x) && isNum(x.y));
  if (okPins.some(x => !near(x))) notes.push('a review note placed far off the plan');
  const pins: Pin[] = okPins.filter(near)
    .map((x: any, i: number) => ({ id: str(x.id, 60) || uid(), n: Number.isInteger(x.n) && x.n > 0 && x.n < 100000 ? x.n : i + 1, x: x.x, y: x.y, comment: str(x.comment, 2000), status: x.status === 'resolved' ? 'resolved' : 'open', author: str(x.author, 80), at: str(x.at, 40), ...(x.ref ? { ref: str(x.ref, 40) } : {}) }));
  const responses: Response[] = (Array.isArray(mk.responses) ? mk.responses : []).slice(0, MAX_RESPONSES).filter((x: any) => x && typeof x === 'object')
    .map((x: any) => ({ id: str(x.id, 60) || uid(), ref: str(x.ref, 40), text: str(x.text, 2000), response: str(x.response, 2000), sheet: str(x.sheet, 60), done: !!x.done, ...(x.pinId ? { pinId: str(x.pinId, 60) } : {}) }));
  out.markup = { pins, responses };
  // Site visit: results are checked like every other field; photos carried in the file go to this device's photo store, never into the saved project.
  const ins = sanitizeInspection(p.inspection); if (ins) out.inspection = ins; else delete out.inspection;
  const photos = sanitizePhotos((p as any).inspectionPhotos, ins); delete (out as any).inspectionPhotos;
  if (Object.keys(photos).length) stagePhotos(photos);
  out.rev = Number.isInteger(p.rev) && p.rev >= 0 ? p.rev : 0;
  out.repairNotes = notes.length ? notes : undefined;
  return out;
}
export const serialize = (p: Project, at = new Date().toISOString()) => { const { repairNotes: _r, ...rest } = p; return JSON.stringify({ ...rest, updatedAt: at }, null, 1); };
/** What the user made, without save bookkeeping: two copies with the same key are the same project state. */
export const contentKey = (p: Project) => { const { repairNotes: _r, updatedAt: _u, rev: _v, ...rest } = p as Project & { rev?: number }; return JSON.stringify(rest); };

// Encrypted share/backup: AES-GCM 256, key from passphrase via PBKDF2-SHA256 600k (PR50, UU1524).
// v1: header not authenticated. v2 (current): the header (format, v, kdf, salt, iv) is bound as AES-GCM additional data.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const KDF = 'PBKDF2-SHA256-600000';
export const ENC_VERSION = 2;
async function key(pass: string, salt: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 600_000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const aad = (h: { format: string; v: number; kdf: string; salt: string; iv: string }) => enc.encode(JSON.stringify([h.format, h.v, h.kdf, h.salt, h.iv]));

/** Very common passphrases are refused (they fall to a guess list in seconds). */
const COMMON = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'welcome1', 'abc12345', 'letmein1', 'contraseña', 'contrasena', '11111111', '00000000', 'aaaaaaaa', 'passw0rd', 'trustno1', 'losangeles', 'garage123', 'permitpack']);
export function passphraseProblem(pass: string): string | null {
  if (pass.length < 8) return 'Use a passphrase of 8 or more characters.';
  if (COMMON.has(pass.toLowerCase()) || /^(.)\1+$/.test(pass) || /^\d+$/.test(pass) && pass.length < 12) return 'That passphrase is too easy to guess. Use 3 or 4 unrelated words.';
  return null;
}
export const encryptPack = (p: Project, pass: string) => encryptText(serialize(p), pass);
/** r5field-08: locks any pack text (the visit pack carries its photos next to the project). Opened by openPack like any locked pack. */
export async function encryptText(text: string, pass: string): Promise<string> {
  const problem = passphraseProblem(pass); if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const h = { format: 'permitpack-encrypted', v: ENC_VERSION, kdf: KDF, salt: b64(salt), iv: b64(iv) };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(h) }, await key(pass, salt), enc.encode(text)));
  return JSON.stringify({ ...h, ct: b64(ct) });
}

/** Parse pack text with plain-language errors (never raw parser messages). */
export function parsePackText(text: string, max = MAX_PACK_BYTES): any {
  if (text.length > max) throw new Error('This file is too large to be a permit pack.');
  try { return JSON.parse(text); } catch { throw new Error('This file is damaged or is not a permit pack.'); }
}
export const isEncrypted = (j: any) => !!j && typeof j === 'object' && j.format === 'permitpack-encrypted';
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const b64len = (v: any) => (typeof v === 'string' && v.length % 4 === 0 && B64.test(v) ? (v.length / 4) * 3 - (v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0) : -1);
/** A locked pack whose header is broken is damaged, not locked: say so before asking for a passphrase. */
export function lockedHeaderProblem(j: any): string | null {
  if (j.v !== 1 && j.v !== 2) return typeof j.v === 'number' && j.v > 2 ? `This locked pack was made by a newer version (v${j.v}). Update the app to open it.` : 'This locked pack is damaged: its header is broken.';
  if (j.kdf !== KDF) return typeof j.kdf === 'string' && j.kdf.startsWith('PBKDF2') ? 'This locked pack uses a lock this version does not know. Update the app to open it.' : 'This locked pack is damaged: its header is broken.';
  if (b64len(j.salt) !== 16 || b64len(j.iv) !== 12 || b64len(j.ct) < 17) return 'This locked pack is damaged: its header is broken.';
  return null;
}

export async function openPack(text: string, pass?: string): Promise<Project> {
  const j = parsePackText(text);
  if (isEncrypted(j)) {
    const bad = lockedHeaderProblem(j); if (bad) throw new Error(bad);
    if (!pass) throw new Error('This pack is locked. Enter its passphrase.');
    let pt: ArrayBuffer;
    try {
      const params: AesGcmParams = { name: 'AES-GCM', iv: unb64(j.iv) as BufferSource };
      if (j.v === 2) params.additionalData = aad(j) as BufferSource;
      pt = await crypto.subtle.decrypt(params, await key(pass, unb64(j.salt)), unb64(j.ct) as BufferSource);
    } catch { throw new Error('Wrong passphrase, or the file was changed.'); }
    return migrate(parsePackText(dec.decode(pt)));
  }
  return migrate(j);
}

/**
 * The whole "open a file" flow, shared by every caller: size cap, parse, ask for a passphrase only when the pack
 * is really locked, then open. `askPass` returns null when the user cancels (result: null, nothing opened).
 */
export async function readPackFile(text: string, askPass: () => Promise<string | null>): Promise<Project | null> {
  const j = parsePackText(text);
  if (isEncrypted(j)) { const bad = lockedHeaderProblem(j); if (bad) throw new Error(bad); const pass = await askPass(); if (!pass) return null; return openPack(text, pass); }
  return openPack(text);
}

/** One file holding every project on this device ("Back up all projects"). Each project inside is checked by migrate on open. */
export const BUNDLE = 'permitpack-bundle';
export const serializeAll = (ps: Project[]) => JSON.stringify({ format: BUNDLE, v: 1, savedAt: new Date().toISOString(), projects: ps.map(p => JSON.parse(serialize(p))) });
/** Returns the projects in a backup-all file, or null when the text is not one. Damaged entries are skipped and counted. */
export function readBundle(text: string): { projects: Project[]; skipped: number } | null {
  const j = parsePackText(text, MAX_BUNDLE_BYTES);
  if (!j || typeof j !== 'object' || j.format !== BUNDLE) { if (text.length > MAX_PACK_BYTES) throw new Error('This file is too large to be a permit pack.'); return null; }
  if (typeof j.v === 'number' && j.v > 1) throw new Error('This backup was made by a newer version of the app. Update the app (reload the page) and try again.');
  if (!Array.isArray(j.projects)) throw new Error('This backup file is damaged.');
  const projects: Project[] = []; let skipped = 0;
  for (const x of j.projects.slice(0, 500)) { try { if (JSON.stringify(x).length > MAX_PACK_BYTES) throw new Error('too large'); projects.push(migrate(x)); } catch { skipped++; } }
  return { projects, skipped };
}
