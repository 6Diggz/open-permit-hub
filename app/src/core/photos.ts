// Site-visit photos live on this device only: IndexedDB when the browser allows it, else memory for this visit
// (the screen says so). They leave the device only inside a .permitpack or PDF the user saves.
import { PHOTO_INPUT_MAX_BYTES, PHOTO_MAX_BYTES } from './inspection';

const DB = 'opa-photos', STORE = 'p';
const mem = new Map<string, Blob>();
let blocked = false;
export const storageBlocked = () => blocked;

function db(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try { if (typeof indexedDB === 'undefined') { blocked = true; return res(null); }
      const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => { blocked = true; res(null); }; r.onblocked = () => res(null);
    } catch { blocked = true; res(null); }
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await db(); if (!d) return undefined;
  return new Promise(res => { try { const t = d.transaction(STORE, mode); const q = fn(t.objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => { blocked = true; res(undefined); }; t.onabort = () => { blocked = true; res(undefined); }; } catch { blocked = true; res(undefined); } });
}
/** Saves a photo. Returns false when it could only be kept in memory (storage blocked or full). */
export async function putPhoto(id: string, b: Blob): Promise<boolean> { mem.set(id, b); const ok = await tx('readwrite', s => s.put(b, id)); return ok !== undefined; }
export async function getPhoto(id: string): Promise<Blob | null> { const m = mem.get(id); if (m) return m; const b = await tx<Blob>('readonly', s => s.get(id) as IDBRequest<Blob>); if (b instanceof Blob) { mem.set(id, b); return b; } return null; }
export async function delPhoto(id: string): Promise<void> { mem.delete(id); await tx('readwrite', s => s.delete(id)); }

/** r5field-06: photo ids stored on this device that no saved project uses (pure, tested). */
export const orphanPhotos = (stored: string[], used: Set<string>) => stored.filter(id => !used.has(id));
/**
 * r5field-06: Remove photo, Retake and Clear the visit no longer delete the image at once (Undo can bring the id back).
 * Images no saved project uses are removed here, once at start, before any undo history exists in this tab.
 */
export async function gcPhotos(used: Set<string>): Promise<number> {
  const keys = await tx<IDBValidKey[]>('readonly', s => s.getAllKeys()); if (!keys) return 0;
  const gone = orphanPhotos(keys.filter((k): k is string => typeof k === 'string'), used);
  for (const id of gone) await tx('readwrite', s => s.delete(id));
  return gone.length;
}
const fromDataUrl = (d: string) => { const bin = atob(d.slice(d.indexOf(',') + 1)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'image/jpeg' }); };
export async function toDataUrl(b: Blob): Promise<string> { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return 'data:image/jpeg;base64,' + btoa(s); }
/** Photos that arrived inside an opened .permitpack: kept in memory at once, written to storage in the background. */
export function stagePhotos(m: Record<string, string>) { for (const [id, d] of Object.entries(m)) { const b = fromDataUrl(d); mem.set(id, b); void tx('readwrite', s => s.put(b, id)); } }

export type PhotoError = 'too-big' | 'unsupported';
/** Phone camera photo -> JPEG of at most PHOTO_MAX_BYTES (long side 1600 px down to 640 px, quality 0.72 down to 0.45). */
export async function compressPhoto(f: Blob): Promise<Blob> {
  if (f.size > PHOTO_INPUT_MAX_BYTES) throw new Error('too-big' satisfies PhotoError);
  let bmp: ImageBitmap; try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { throw new Error('unsupported' satisfies PhotoError); }
  try {
    for (const side of [1600, 1280, 1024, 800, 640]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height)); const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g) throw new Error('unsupported');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
      for (const q of [0.72, 0.6, 0.45]) { const b = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', q)); if (b && b.size <= PHOTO_MAX_BYTES) return b; }
    }
    throw new Error('too-big' satisfies PhotoError);
  } finally { bmp.close?.(); }
}
