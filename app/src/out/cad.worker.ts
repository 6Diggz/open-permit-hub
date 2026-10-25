/// <reference lib="webworker" />
// Runs the CAD engine (WASM) off the main thread so a big or hostile file can't freeze the page (qa-15, appsec-16).
// The page can stop this worker at any time (Cancel, or the time limit); a crash here never touches the page.
import init, * as engine from '../clean-wasm/cleanfix.js';
import { runJob, type CadReq } from './cadjob';
let ready: Promise<unknown> | null = null;
self.onmessage = async (e: MessageEvent<CadReq>) => {
  try { ready ??= init(); await ready; } catch (err) { ready = null; self.postMessage({ id: e.data.id, ok: false, error: String((err as Error)?.message ?? err) }); return; }
  const r = runJob(engine, e.data);
  if (r.ok && r.bytes) self.postMessage(r, [r.bytes.buffer as ArrayBuffer]); else self.postMessage(r);
};
