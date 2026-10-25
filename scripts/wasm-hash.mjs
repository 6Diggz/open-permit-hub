// Content hash of the Rust sources the CAD WebAssembly is built from (clean/src, Cargo.toml, Cargo.lock).
// `node scripts/wasm-hash.mjs write` runs right after wasm-pack and stores the hash next to the WASM
// (app/src/clean-wasm/src.sha256). The tests compare it with the sources: a stale build fails with a clear
// message, and a fresh git checkout (new file times, same content) still passes. File times are never used.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLEAN = join(root, 'clean');
export const HASH_FILE = join(root, 'app', 'src', 'clean-wasm', 'src.sha256');

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p)); else if (e.name.endsWith('.rs')) out.push(p);
  }
  return out;
}
/** sha256 over each source's relative path and bytes, in sorted order. Line endings are normalized (a Windows checkout hashes the same). */
export function srcHash(clean = CLEAN) {
  const list = [...files(join(clean, 'src')), ...['Cargo.toml', 'Cargo.lock'].map(f => join(clean, f)).filter(existsSync)]
    .map(p => relative(clean, p).split('\\').join('/')).sort();
  const h = createHash('sha256');
  for (const r of list) { h.update(r + '\0'); h.update(readFileSync(join(clean, r), 'utf8').replace(/\r\n/g, '\n')); h.update('\0'); }
  return h.digest('hex');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hash = srcHash();
  if (process.argv[2] === 'write') { writeFileSync(HASH_FILE, hash + '\n'); console.log('wrote', relative(root, HASH_FILE), hash); }
  else console.log(hash);
}
