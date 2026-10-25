/// <reference types="node" />
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync } from '../clean-wasm/cleanfix.js';
let done = false;
const BUILD = 'cd clean && wasm-pack build --release --target web --out-dir ../app/src/clean-wasm';
/** Newest mtime of the Rust sources the WASM is built from. */
function newestSource(dir: string): number {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'target') t = Math.max(t, newestSource(p)); }
    else if (/\.(rs|toml)$/.test(e.name)) t = Math.max(t, statSync(p).mtimeMs);
  }
  return t;
}
/** Load the CAD WASM in Node from the built file (CI builds it before the tests).
 * Refuses a WASM older than the Rust sources: a stale local build made two tests
 * fail locally while CI (fresh build) stayed green. */
export function initCleanfix() {
  if (done) return; const f = new URL('../clean-wasm/cleanfix_bg.wasm', import.meta.url);
  if (!existsSync(f)) throw new Error('Build the WASM first: ' + BUILD);
  const src = fileURLToPath(new URL('../../../clean/', import.meta.url));
  if (existsSync(src) && newestSource(src) > statSync(f).mtimeMs) throw new Error('The WASM is older than clean/ sources. Rebuild: ' + BUILD);
  initSync({ module: readFileSync(f) }); done = true;
}
