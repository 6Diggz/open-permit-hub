/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs';
import { initSync } from '../clean-wasm/cleanfix.js';
let done = false;
/** Load the CAD WASM in Node from the built file (CI builds it before the tests). */
export function initCleanfix() {
  if (done) return; const f = new URL('../clean-wasm/cleanfix_bg.wasm', import.meta.url);
  if (!existsSync(f)) throw new Error('Build the WASM first: cd clean && wasm-pack build --release --target web --out-dir ../app/src/clean-wasm');
  initSync({ module: readFileSync(f) }); done = true;
}
