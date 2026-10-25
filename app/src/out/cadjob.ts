/** The jobs the CAD worker runs (qa-15, appsec-16). Pure: takes the loaded WASM module, so tests can run it in Node. */
export type CadOp = 'inspect' | 'loss' | 'clean';
export type CadReq = { id: number; op: CadOp; bytes: Uint8Array; target?: string; units?: number; opts?: string };
export type CadRes = { id: number; ok: true; text?: string; bytes?: Uint8Array } | { id: number; ok: false; error: string };
type Engine = { inspect(b: Uint8Array): string; loss_with(b: Uint8Array, t: string, u: number, o: string): string; clean_with(b: Uint8Array, t: string, u: number, o: string): Uint8Array };
export function runJob(m: Engine, q: CadReq): CadRes {
  try {
    const t = q.target ?? 'r2018', u = q.units ?? -1, o = q.opts ?? '{}';
    if (q.op === 'inspect') return { id: q.id, ok: true, text: m.inspect(q.bytes) };
    if (q.op === 'loss') return { id: q.id, ok: true, text: m.loss_with(q.bytes, t, u, o) };
    if (q.op === 'clean') return { id: q.id, ok: true, bytes: m.clean_with(q.bytes, t, u, o) };
    return { id: q.id, ok: false, error: 'Unknown job' };
  } catch (e) { return { id: q.id, ok: false, error: String((e as Error)?.message ?? e) }; }
}
