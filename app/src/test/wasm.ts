/// <reference types="node" />
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync } from '../clean-wasm/cleanfix.js';
let done = false;
export const BUILD = 'cd clean && wasm-pack build --release --target web --out-dir ../app/src/clean-wasm && node ../scripts/wasm-hash.mjs write';
export const CLEAN_DIR = fileURLToPath(new URL('../../../clean/', import.meta.url));
export const HASH_FILE = fileURLToPath(new URL('../clean-wasm/src.sha256', import.meta.url));

function rsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) out.push(...rsFiles(p)); else if (e.name.endsWith('.rs')) out.push(p); }
  return out;
}
/** Content hash of the Rust sources (same as scripts/wasm-hash.mjs, which writes it at build time; a test keeps the two equal). */
export function srcHash(clean = CLEAN_DIR): string {
  const list = [...rsFiles(join(clean, 'src')), ...['Cargo.toml', 'Cargo.lock'].map(f => join(clean, f)).filter(existsSync)]
    .map(p => relative(clean, p).split('\\').join('/')).sort();
  const h = createHash('sha256');
  for (const r of list) { h.update(r + '\0'); h.update(readFileSync(join(clean, r), 'utf8').replace(/\r\n/g, '\n')); h.update('\0'); }
  return h.digest('hex');
}
/** Why the built WASM can't be trusted, or null when it matches the sources. Compares content hashes, never file times
 * (a git pull gives every file a new time, which made a correct build look old). */
export function staleReason(clean = CLEAN_DIR, hashFile = HASH_FILE): string | null {
  if (!existsSync(clean)) return null; // sources not in this checkout: nothing to compare
  if (!existsSync(hashFile)) return 'The WASM has no source hash (built without scripts/wasm-hash.mjs). Rebuild: ' + BUILD;
  const built = readFileSync(hashFile, 'utf8').trim(); const now = srcHash(clean);
  return built === now ? null : `The WASM was built from different clean/ sources (built ${built.slice(0, 12)}, now ${now.slice(0, 12)}). Rebuild: ${BUILD}`;
}
/** Load the CAD WASM in Node from the built file (CI builds it fresh before the tests). */
export function initCleanfix() {
  if (done) return; const f = new URL('../clean-wasm/cleanfix_bg.wasm', import.meta.url);
  if (!existsSync(f)) throw new Error('Build the WASM first: ' + BUILD);
  const why = staleReason(); if (why) throw new Error(why);
  initSync({ module: readFileSync(f) }); done = true;
}
