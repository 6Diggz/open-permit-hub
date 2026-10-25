import type { Project } from './model';
import { migrate, serialize } from './permitpack';

/** Many projects on one device (drafter workflow). Keys: opa.index (list), opa.p.<id> (data). Every access is try/catch. */
export interface Entry { id: string; name: string; address: string; updatedAt: string; demo: boolean }
const IDX = 'opa.index', LEGACY = 'opa.project.v1', P = (id: string) => `opa.p.${id}`;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* blocked */ } };

export function list(): Entry[] {
  const legacy = get(LEGACY);
  if (legacy) { try { const p = migrate(JSON.parse(legacy)); save(p); del(LEGACY); } catch { set(LEGACY + '.broken', legacy); del(LEGACY); } }
  try { const l = JSON.parse(get(IDX) ?? '[]'); return Array.isArray(l) ? l.sort((a: Entry, b: Entry) => b.updatedAt.localeCompare(a.updatedAt)) : []; } catch { return []; }
}
export function save(p: Project): boolean {
  const ok = set(P(p.id), serialize(p)); if (!ok) return false;
  const l = list().filter(e => e.id !== p.id);
  l.unshift({ id: p.id, name: p.name, address: p.site.address, updatedAt: new Date().toISOString(), demo: p.site.apn.startsWith('0000-') });
  return set(IDX, JSON.stringify(l));
}
export function open(id: string): Project { const raw = get(P(id)); if (!raw) throw new Error('This project is no longer on this device.'); return migrate(JSON.parse(raw)); }
export function remove(id: string) { del(P(id)); set(IDX, JSON.stringify(list().filter(e => e.id !== id))); }
export function duplicate(id: string): Project { const p = open(id); const c: Project = { ...structuredClone(p), id: crypto.randomUUID(), name: p.name + ' (copy)', createdAt: new Date().toISOString() }; save(c); return c; }
export const lastId = () => list()[0]?.id ?? null;
