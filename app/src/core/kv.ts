// OUT2-10: project storage. Projects live in IndexedDB (bigger quota than localStorage, and the browser's
// persistent-storage grant covers it). The store above stays synchronous: every key is read into memory once at
// start, reads come from memory, and each write goes to memory at once and to IndexedDB right after.
// Fallbacks, in order: IndexedDB -> localStorage (old behavior) -> nothing (the app says "Not saved: storage is blocked").
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export type Backend = 'idb' | 'local' | 'none';

const DB = 'opa-store', OS = 'kv';
/** Write-ahead journal in localStorage (see initKV). DEL marks a delete. */
export const WAL = 'opa.wal.', DEL = '\u0000del';
/** Keys that hold projects. Preferences (language, author name, tips) stay in localStorage. */
export const isProjectKey = (k: string) => k === 'opa.index' || k.startsWith('opa.p.') || k === 'opa.project.v1' || k === 'opa.project.v1.broken';

const revOf = (raw: string | undefined | null): number => { if (raw == null) return -1; try { const r = JSON.parse(raw).rev; return Number.isInteger(r) ? r : 0; } catch { return 0; } };
const listOf = (raw: string | undefined | null): any[] => { try { const l = JSON.parse(raw ?? '[]'); return Array.isArray(l) ? l.filter(e => e && typeof e.id === 'string') : []; } catch { return []; } };

/**
 * Lossless merge of a localStorage save into the IndexedDB copy (pure, tested). Rules:
 * - a project only in localStorage is copied;
 * - a project in both keeps the copy with the higher save counter (an old tab may have kept saving there);
 * - the project list is the union, the newer entry wins for each id, and only ids that have data are kept;
 * - the v0.1 single-project key and its ".broken" copy are carried over untouched (the store migrates them).
 * Returns the keys to write. Nothing is ever dropped.
 */
export function mergeLegacy(idb: Map<string, string>, local: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(local)) {
    if (!isProjectKey(k) || k === 'opa.index') continue;
    if (k.startsWith('opa.p.')) { const cur = idb.get(k); if (cur == null || revOf(v) > revOf(cur)) out.set(k, v); continue; }
    if (!idb.has(k)) out.set(k, v); else if (idb.get(k) !== v) out.set(k + '.' + Date.now(), v); // never overwrite a different legacy copy
  }
  const has = (id: string) => out.has('opa.p.' + id) || idb.has('opa.p.' + id);
  const byId = new Map<string, any>();
  for (const e of [...listOf(idb.get('opa.index')), ...listOf(local['opa.index'])]) { const o = byId.get(e.id); if (!o || String(e.updatedAt) > String(o.updatedAt)) byId.set(e.id, e); }
  // A project with data but no list entry (crash between the two writes) gets one, so it is never invisible.
  for (const k of [...idb.keys(), ...out.keys()]) if (k.startsWith('opa.p.')) { const id = k.slice(6); if (!byId.has(id)) { try { const p = JSON.parse((out.get(k) ?? idb.get(k))!); byId.set(id, { id, name: String(p.name ?? ''), address: String(p.site?.address ?? ''), updatedAt: String(p.updatedAt ?? ''), demo: String(p.site?.apn ?? '').startsWith('0000-') }); } catch { byId.set(id, { id, name: '', address: '', updatedAt: '', demo: false }); } } }
  const idx = JSON.stringify([...byId.values()].filter(e => has(e.id)));
  if (idx !== (idb.get('opa.index') ?? '[]') || out.size) out.set('opa.index', idx);
  return out;
}

const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error ?? new Error('abort')); });

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('timeout')), 4000);
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => { clearTimeout(timer); res(r.result); }; r.onerror = () => { clearTimeout(timer); rej(r.error); }; r.onblocked = () => { clearTimeout(timer); rej(new Error('blocked')); };
    } catch (e) { clearTimeout(timer); rej(e); }
  });
}
async function readAll(d: IDBDatabase): Promise<Map<string, string>> {
  const t = d.transaction(OS, 'readonly'); const s = t.objectStore(OS);
  const [keys, vals] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
  const m = new Map<string, string>(); keys.forEach((k, i) => { if (typeof k === 'string' && typeof vals[i] === 'string') m.set(k, vals[i]); }); return m;
}
const localKV = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export interface Opened { kv: KV | null; backend: Backend; moved: number }
// Until initKV switches to IndexedDB, every call looks localStorage up again (it can be blocked or replaced).
let current: Opened | null = null;
const now = (): Opened => current ?? { kv: localKV(), backend: localKV() ? 'local' : 'none', moved: 0 };
export const kv = () => now().kv;
export const backend = () => now().backend;
/** Fired on window when a background IndexedDB write fails, so the screen can say "Not saved". */
export const STORE_ERROR = 'opa-store-error';
/** Fired on window when another tab saved a key (detail: the key). Replaces the localStorage "storage" event. */
export const STORE_CHANGE = 'opa-store-change';

/** Opens IndexedDB, moves any localStorage projects into it (verified, then removed from localStorage), and switches the store to it. */
export async function initKV(): Promise<Opened> {
  try { if (typeof indexedDB === 'undefined') return now(); } catch { return now(); }
  let d: IDBDatabase; try { d = await openDb(); } catch { return now(); }
  try {
    const mem = await readAll(d); const ls = localKV(); const local: Record<string, string> = {};
    const wal: Record<string, string> = {}; const dels: string[] = [];
    if (ls) { try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (!k) continue; const v = ls.getItem(k); if (v == null) continue;
      if (k.startsWith(WAL)) { wal[k] = v; const real = k.slice(WAL.length); if (v === DEL) dels.push(real); else if (isProjectKey(real)) local[real] = v; } else if (isProjectKey(k) && !(k in local)) local[k] = v; } } catch { /* blocked */ } }
    const legacyCount = Object.keys(local).filter(k => (k.startsWith('opa.p.') || k === 'opa.project.v1') && !(WAL + k in wal)).length;
    // A delete that did not reach IndexedDB before the page closed (journal tombstone): finish it.
    const delNow = dels.filter(k => k.startsWith('opa.p.') && mem.has(k) && !(k in local));
    if (delNow.length) { const t = d.transaction(OS, 'readwrite'); for (const k of delNow) t.objectStore(OS).delete(k); await done(t); for (const k of delNow) mem.delete(k); }
    const add = mergeLegacy(mem, local); let moved = 0;
    if (add.size) {
      const t = d.transaction(OS, 'readwrite'); const s = t.objectStore(OS); for (const [k, v] of add) s.put(v, k); await done(t);
      // Verify every moved key reads back exactly before the localStorage copy is removed.
      const back = await readAll(d); const ok = [...add].every(([k, v]) => back.get(k) === v);
      if (!ok) { d.close(); return now(); }
      for (const [k, v] of add) mem.set(k, v);
      moved = legacyCount;
    }
    // Journal entries are now in IndexedDB (or IndexedDB held a newer save): clear them.
    if (ls) for (const k of Object.keys(wal)) { try { ls.removeItem(k); } catch { /* blocked */ } }
    if (ls) for (const k of Object.keys(local)) { if (WAL + k in wal) continue; const v = local[k]; const there = mem.get(k);
      // Remove a localStorage copy only when IndexedDB holds the same text or a newer save of it.
      if (there === v || (k.startsWith('opa.p.') && revOf(there) >= revOf(v)) || k === 'opa.index' || (k.startsWith('opa.project.v1') && [...mem.values()].includes(v))) { try { ls.removeItem(k); } catch { /* blocked */ } } }
    const ch = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('opa-store');
    const fail = () => { try { window.dispatchEvent(new Event(STORE_ERROR)); } catch { /* not a browser */ } };
    // Write-ahead journal: an IndexedDB write runs after the call returns, and a page closed or reloaded right after a save could
    // lose it. Each write is first copied to localStorage (synchronous, like the old store) and the copy is removed once
    // IndexedDB has it; the next start replays any copy left behind. If localStorage is full or blocked, IndexedDB alone is used.
    const journal = (k: string, v: string) => { if (!ls) return; try { ls.setItem(WAL + k, v); } catch { /* full or blocked */ } };
    const settle = (k: string, v: string) => { if (!ls) return; try { if (ls.getItem(WAL + k) === v) ls.removeItem(WAL + k); } catch { /* blocked */ } };
    const write = (fn: (s: IDBObjectStore) => void, k: string, v: string) => { journal(k, v); try { const t = d.transaction(OS, 'readwrite'); fn(t.objectStore(OS)); done(t).then(() => settle(k, v), fail); } catch { fail(); } };
    if (ch) ch.onmessage = e => { const { k, v } = e.data ?? {}; if (typeof k !== 'string') return; if (v == null) mem.delete(k); else mem.set(k, v); try { window.dispatchEvent(new CustomEvent(STORE_CHANGE, { detail: k })); } catch { /* not a browser */ } };
    const store: KV = {
      getItem: k => mem.get(k) ?? null,
      setItem: (k, v) => { mem.set(k, v); write(s => s.put(v, k), k, v); ch?.postMessage({ k, v }); },
      removeItem: k => { mem.delete(k); write(s => s.delete(k), k, DEL); ch?.postMessage({ k, v: null }); },
    };
    current = { kv: store, backend: 'idb', moved }; return current;
  } catch { try { d.close(); } catch { /* closed */ } return now(); }
}

export type Persist = 'granted' | 'denied' | 'unsupported';
/** Ask the browser to keep this site's data (not cleared under storage pressure). Returns what it said. */
export async function requestPersist(): Promise<Persist> {
  try { const s = navigator.storage; if (!s?.persist) return 'unsupported'; if (await s.persisted?.()) return 'granted'; return (await s.persist()) ? 'granted' : 'denied'; } catch { return 'unsupported'; }
}
let asked: Promise<Persist> | null = null;
/** One request per page load, shared by every screen that shows the answer. */
export const persistResult = () => (asked ??= requestPersist());
/** iOS Safari only (not Chrome/Firefox/Edge on iOS, not an installed Home Screen app). iPadOS reports a Mac with touch. */
export function isIosSafari(ua: string, touchPoints: number, standalone: boolean): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV/.test(ua) && !standalone;
}
