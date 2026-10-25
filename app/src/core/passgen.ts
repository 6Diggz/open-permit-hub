// appsec-08: diceware-style passphrase made on this device from the bundled EFF large word list (7,776 words).
// Each word adds log2(7776) = 12.9 bits; 5 words = 64.6 bits, on top of the 600,000-round PBKDF2 key stretch.
import { EFF_WORDS } from './eff-words';

export const WORDS = 5;
export const BITS_PER_WORD = Math.log2(EFF_WORDS.length);
/** Uniform random index below n (rejection sampling, no modulo bias). */
export function randIndex(n: number, rnd: (a: Uint32Array<ArrayBuffer>) => void = a => { crypto.getRandomValues(a); }): number {
  const lim = Math.floor(0x100000000 / n) * n; const a = new Uint32Array(new ArrayBuffer(4));
  for (;;) { rnd(a); if (a[0] < lim) return a[0] % n; }
}
export function makePassphrase(words = WORDS, rnd?: (a: Uint32Array<ArrayBuffer>) => void): string {
  return Array.from({ length: words }, () => EFF_WORDS[randIndex(EFF_WORDS.length, rnd)]).join('-');
}
