import { FORMAT, FORMAT_VERSION, type Project, blankProject, uid, UUID_RE } from './model';
import { isNum, MAX_LEN_MM } from './units';
import type { Poly } from './geom';

/** Packs larger than this are refused before parsing (a real project is a few KB). */
export const MAX_PACK_BYTES = 5 * 1024 * 1024;
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
  s.primaryHeightMm = fix('house height', s.primaryHeightMm, len, base.site.primaryHeightMm);
  s.existingAdus = numOrNull(s.existingAdus, 100); s.existingJadus = numOrNull(s.existingJadus, 100);
  s.address = str(s.address); s.apn = str(s.apn, 40);
  for (const k of Object.keys(base.site.flags) as (keyof typeof base.site.flags)[]) s.flags[k] = tri(s.flags[k]);
  // Windows: cap the count, sanitize every number.
  if (!Array.isArray(a.windows)) a.windows = [];
  if (a.windows.length > MAX_WINDOWS) { a.windows = a.windows.slice(0, MAX_WINDOWS); notes.push(`windows over ${MAX_WINDOWS}`); }
  let badWin = false;
  a.windows = a.windows.filter((w: any) => w && typeof w === 'object').map((w: any) => {
    const n = (v: any) => { if (v == null) return null; if (len(v)) return v; badWin = true; return null; };
    return { id: str(w.id, 60) || uid(), room: str(w.room, 60), sleeping: !!w.sleeping, gradeFloor: !!w.gradeFloor, clearWidthMm: n(w.clearWidthMm), clearHeightMm: n(w.clearHeightMm), sillMm: n(w.sillMm) };
  });
  if (badWin) notes.push('a window size');
  out.rev = Number.isInteger(p.rev) && p.rev >= 0 ? p.rev : 0;
  out.repairNotes = notes.length ? notes : undefined;
  return out;
}
export const serialize = (p: Project) => { const { repairNotes: _r, ...rest } = p; return JSON.stringify({ ...rest, updatedAt: new Date().toISOString() }, null, 1); };

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
export async function encryptPack(p: Project, pass: string): Promise<string> {
  const problem = passphraseProblem(pass); if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const h = { format: 'permitpack-encrypted', v: ENC_VERSION, kdf: KDF, salt: b64(salt), iv: b64(iv) };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(h) }, await key(pass, salt), enc.encode(serialize(p))));
  return JSON.stringify({ ...h, ct: b64(ct) });
}

/** Parse pack text with plain-language errors (never raw parser messages). */
export function parsePackText(text: string): any {
  if (text.length > MAX_PACK_BYTES) throw new Error('This file is too large to be a permit pack.');
  try { return JSON.parse(text); } catch { throw new Error('This file is damaged or is not a permit pack.'); }
}
export const isEncrypted = (j: any) => !!j && typeof j === 'object' && j.format === 'permitpack-encrypted';

export async function openPack(text: string, pass?: string): Promise<Project> {
  const j = parsePackText(text);
  if (isEncrypted(j)) {
    if (j.v !== 1 && j.v !== 2) throw new Error(`This locked pack was made by a newer version (v${j.v}). Update the app to open it.`);
    if (j.kdf !== KDF) throw new Error('This locked pack uses a lock this version does not know. Update the app to open it.');
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
  if (isEncrypted(j)) { const pass = await askPass(); if (!pass) return null; return openPack(text, pass); }
  return openPack(text);
}
