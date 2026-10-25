import type { Project } from './model';
import { uid } from './model';
import { contentKey, migrate, serialize } from './permitpack';

/** Many projects on one device (drafter workflow). Keys: opa.index (list), opa.p.<id> (data). Every access is try/catch. */
export interface Entry { id: string; name: string; address: string; updatedAt: string; demo: boolean }
export type SaveResult = 'ok' | 'blocked' | 'conflict';
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const IDX = 'opa.index', LEGACY = 'opa.project.v1', P = (id: string) => `opa.p.${id}`;
export const keyOf = P;

/**
 * One store per browser tab. `seen` remembers the save counter this tab last read or wrote for each project,
 * so a write from another tab is detected (conflict) instead of silently overwritten (last writer wins).
 */
export function makeStore(kv: () => KV | null) {
  const seen = new Map<string, number>();
  const get = (k: string) => { try { return kv()?.getItem(k) ?? null; } catch { return null; } };
  const set = (k: string, v: string) => { try { const s = kv(); if (!s) return false; s.setItem(k, v); return true; } catch { return false; } };
  const del = (k: string) => { try { kv()?.removeItem(k); } catch { /* blocked */ } };
  const storedRev = (id: string): number | null => { const raw = get(P(id)); if (!raw) return null; try { const r = JSON.parse(raw).rev; return Number.isInteger(r) ? r : 0; } catch { return 0; } };

  const index = (): Entry[] => { try { const l = JSON.parse(get(IDX) ?? '[]'); return Array.isArray(l) ? l.filter(e => e && typeof e.id === 'string').sort((a: Entry, b: Entry) => String(b.updatedAt).localeCompare(String(a.updatedAt))) : []; } catch { return []; } };
  function list(): Entry[] {
    const legacy = get(LEGACY);
    if (legacy) {
      // Migrate the v0.1 single-project save once. It is removed only after the new copy is stored and listed.
      let p: Project | null = null; try { p = migrate(JSON.parse(legacy)); } catch { set(LEGACY + '.broken', legacy); del(LEGACY); }
      if (p && save(p) === 'ok') del(LEGACY);
    }
    return index();
  }
  /** Save. Refuses ('conflict') when another tab saved this project after this tab last read it, unless `force`. */
  /** Save. `keepTime` keeps the project's own "last edited" time (restoring a backup). */
  function save(p: Project, opts: { force?: boolean; keepTime?: boolean } = {}): SaveResult {
    const cur = storedRev(p.id), mine = seen.get(p.id);
    if (!opts.force && cur != null && mine != null && cur !== mine) return 'conflict';
    const rev = (cur ?? 0) + 1; const before = get(P(p.id));
    // Opening a project, or saving it unchanged, must not move its "last edited" date.
    if (before && !opts.keepTime) { try { const old = migrate(JSON.parse(before)); if (contentKey(old) === contentKey(p) && index().some(e => e.id === p.id)) { seen.set(p.id, cur ?? 0); return 'ok'; } } catch { /* damaged: overwrite */ } }
    const at = opts.keepTime && p.updatedAt && !Number.isNaN(Date.parse(p.updatedAt)) ? p.updatedAt : new Date().toISOString();
    if (!set(P(p.id), serialize({ ...p, rev }, at))) return 'blocked';
    const l = index().filter(e => e.id !== p.id);
    l.unshift({ id: p.id, name: p.name, address: p.site.address, updatedAt: at, demo: p.site.apn.startsWith('0000-') });
    // If the list can't be written, undo the data write so no project is stored but missing from the list.
    if (!set(IDX, JSON.stringify(l))) { if (before == null) del(P(p.id)); else set(P(p.id), before); return 'blocked'; }
    seen.set(p.id, rev);
    return 'ok';
  }
  function open(id: string): Project {
    const raw = get(P(id)); if (!raw) throw new Error('This project is no longer on this device.');
    let j: unknown; try { j = JSON.parse(raw); } catch { throw new Error('The saved copy is damaged.'); }
    const p = migrate(j); seen.set(p.id, p.rev ?? 0);
    if (p.id !== id) { p.id = id; } // keep the storage key stable
    return p;
  }
  /** Raw stored text, so a project that can't be opened can still be downloaded and rescued. */
  const raw = (id: string) => get(P(id));
  function remove(id: string) { del(P(id)); seen.delete(id); set(IDX, JSON.stringify(list().filter(e => e.id !== id))); }
  function duplicate(id: string): Project { const p = open(id); const c: Project = { ...structuredClone(p), id: uid(), name: p.name + ' (copy)', createdAt: new Date().toISOString(), rev: 0 }; save(c); return c; }
  const has = (id: string) => get(P(id)) != null;
  const lastId = () => list()[0]?.id ?? null;
  return { list, save, open, raw, remove, duplicate, has, lastId };
}

const browser = makeStore(() => (typeof localStorage === 'undefined' ? null : localStorage));
export const { list, save, open, raw, remove, duplicate, has, lastId } = browser;
