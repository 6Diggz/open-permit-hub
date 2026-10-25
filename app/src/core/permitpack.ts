import { FORMAT, FORMAT_VERSION, type Project, blankProject } from './model';

/** Versioned file format with forward migrations (UU025-family, semver + migrations). */
const MIGRATIONS: Record<number, (p: any) => any> = {
  // 1 -> 2 example slot; v1 is current.
};
export function migrate(raw: any): Project {
  if (!raw || raw.format !== FORMAT) throw new Error('This file is not a permit pack.');
  if (typeof raw.version !== 'number' || raw.version > FORMAT_VERSION)
    throw new Error(`This pack was made by a newer version (v${raw.version}). Update the app to open it.`);
  let p = raw; while (p.version < FORMAT_VERSION) { const m = MIGRATIONS[p.version]; if (!m) throw new Error(`This pack is from an unsupported version (v${p.version}).`); p = m(p); }
  const okPoly = (x: any) => Array.isArray(x) && x.every((q: any) => q && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (!p.site || !p.adu || !okPoly(p.site.lot) || !okPoly(p.site.primary) || !okPoly(p.adu.footprint)) throw new Error('This pack is damaged: the drawing data is missing or invalid.');
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  p.adu.heightMm = num(p.adu.heightMm) ?? 3657.6; p.adu.ceilingHeightMm = num(p.adu.ceilingHeightMm); p.adu.hosePullFt = num(p.adu.hosePullFt);
  p.adu.interiorLivableSqFt = num(p.adu.interiorLivableSqFt); p.adu.addedAreaSqFt = num(p.adu.addedAreaSqFt) ?? 0;
  const base = blankProject();
  return { ...base, ...p, site: { ...base.site, ...p.site, flags: { ...base.site.flags, ...p.site?.flags } }, adu: { ...base.adu, ...p.adu }, people: { ...base.people, ...p.people }, modules: { ...base.modules, ...p.modules }, confirmed: { lot: true, house: true, adu: true, ...p.confirmed } };
}
export const serialize = (p: Project) => JSON.stringify({ ...p, updatedAt: new Date().toISOString() }, null, 1);

// Encrypted share/backup: AES-GCM 256, key from passphrase via PBKDF2-SHA256 600k (PR50, UU1524).
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function key(pass: string, salt: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 600_000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptPack(p: Project, pass: string): Promise<string> {
  if (pass.length < 8) throw new Error('Use a passphrase of 8 or more characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), enc.encode(serialize(p))));
  return JSON.stringify({ format: 'permitpack-encrypted', v: 1, kdf: 'PBKDF2-SHA256-600000', salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}
export async function openPack(text: string, pass?: string): Promise<Project> {
  const j = JSON.parse(text);
  if (j.format === 'permitpack-encrypted') {
    if (!pass) throw new Error('This pack is locked. Enter its passphrase.');
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, await key(pass, unb64(j.salt)), unb64(j.ct));
      return migrate(JSON.parse(dec.decode(pt)));
    } catch { throw new Error('Wrong passphrase, or the file was changed.'); }
  }
  return migrate(j);
}
