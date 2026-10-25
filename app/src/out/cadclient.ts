/** Page side of the CAD worker: one job at a time, a time limit, Cancel, and a fresh worker after any stop or crash. */
import type { CadReq, CadRes } from './cadjob';
export class CadStopped extends Error { reason: 'cancel' | 'timeout' | 'crash'; constructor(reason: 'cancel' | 'timeout' | 'crash', msg: string) { super(msg); this.reason = reason; this.name = 'CadStopped'; } }
type W = { postMessage(m: unknown): void; terminate(): void; onmessage: ((e: MessageEvent) => void) | null; onerror: ((e: unknown) => void) | null };
export type WorkerFactory = () => W;
/** Time limit for one job: 30 s plus 1 s per MB, at most 3 minutes (a phone is several times slower than a desktop). */
export const timeLimitMs = (bytes: number) => Math.min(180_000, 30_000 + Math.ceil(bytes / 1e6) * 1000);
export function createCadClient(make: WorkerFactory) {
  let w: W | null = null; let seq = 0; let cur: { id: number; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const kill = () => { try { w?.terminate(); } catch { /* already gone */ } w = null; };
  const stop = (why: CadStopped['reason']) => {
    if (!cur) return; const c = cur; cur = null; clearTimeout(c.timer); kill();
    c.reject(new CadStopped(why, why === 'cancel' ? 'Stopped. Nothing was changed.' : why === 'timeout' ? 'This file took too long and was stopped. It may be very large or damaged. Try it on a desktop computer, or ask the sender to save it again.' : 'The CAD engine stopped on this file. Save as DXF 2018 instead, or ask the sender to save the file again.'));
  };
  function run(q: Omit<CadReq, 'id'>, limitMs = timeLimitMs(q.bytes.length)): Promise<CadRes & { ok: true }> {
    if (cur) stop('cancel');
    return new Promise((resolve, reject) => {
      const id = ++seq; w ??= make();
      w.onmessage = (e: MessageEvent<CadRes>) => {
        if (!cur || e.data.id !== id) return; clearTimeout(cur.timer); cur = null;
        if (e.data.ok) { resolve(e.data); return; }
        // A WASM trap leaves the engine in an unknown state: start a fresh worker for the next job.
        if (/unreachable|RuntimeError|memory access out of bounds|out of memory/i.test(e.data.error)) kill();
        reject(new Error(e.data.error));
      };
      w.onerror = () => stop('crash');
      cur = { id, reject, timer: setTimeout(() => stop('timeout'), limitMs) };
      w.postMessage({ ...q, id });
    });
  }
  return { run, cancel: () => stop('cancel'), busy: () => !!cur };
}
let shared: ReturnType<typeof createCadClient> | null = null;
/** The app's one CAD worker client. */
export function cad() { return shared ??= createCadClient(() => new Worker(new URL('./cad.worker.ts', import.meta.url), { type: 'module' }) as unknown as W); }
