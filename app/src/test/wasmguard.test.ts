// Review 4 item 0: the stale-WASM guard compared file times, so a fresh git pull (new times, same content) flagged a correct
// build as old and 7 tests failed. The guard now compares a content hash written at build time.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { srcHash, staleReason, CLEAN_DIR } from './wasm';

function fakeClean() {
  const d = mkdtempSync(join(tmpdir(), 'clean-')); mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src', 'lib.rs'), 'pub fn a() {}\n'); writeFileSync(join(d, 'Cargo.toml'), '[package]\nname="x"\n');
  return d;
}
describe('stale-WASM guard (content hash, not file times)', () => {
  it('a checkout with new file times but the same content is not stale', () => {
    const d = fakeClean(); const hf = join(d, 'src.sha256'); writeFileSync(hf, srcHash(d) + '\n');
    const later = new Date(Date.now() + 86400e3); utimesSync(join(d, 'src', 'lib.rs'), later, later); // what git pull does
    expect(staleReason(d, hf)).toBeNull();
  });
  it('a source edit makes the build stale', () => {
    const d = fakeClean(); const hf = join(d, 'src.sha256'); writeFileSync(hf, srcHash(d));
    writeFileSync(join(d, 'src', 'lib.rs'), 'pub fn b() {}\n'); expect(staleReason(d, hf)).toMatch(/different clean\/ sources/);
  });
  it('CRLF line endings hash the same (Windows checkout)', () => {
    const d = fakeClean(); const h = srcHash(d); const e = join(tmpdir(), 'crlf-' + Date.now()); cpSync(d, e, { recursive: true });
    writeFileSync(join(e, 'src', 'lib.rs'), 'pub fn a() {}\r\n'); expect(srcHash(e)).toBe(h);
  });
  it('a missing hash file asks for a rebuild', () => { const d = fakeClean(); expect(staleReason(d, join(d, 'nope'))).toMatch(/no source hash/); });
  it('the build script and the guard compute the same hash', () => {
    const script = fileURLToPath(new URL('../../../scripts/wasm-hash.mjs', import.meta.url));
    expect(execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim()).toBe(srcHash(CLEAN_DIR));
  });
  it('the local WASM matches the current sources', () => { expect(staleReason()).toBeNull(); });
});
