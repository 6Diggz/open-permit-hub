import { decodeHex, notePdf } from '../pdfglyphs';
import { unzlibSync } from 'fflate';
const bin = (u: Uint8Array) => { let r = ''; for (let i = 0; i < u.length; i += 0x8000) r += String.fromCharCode(...u.subarray(i, i + 0x8000)); return r; };
/** Page content streams (decompressed), in file order. */
export function streams(bytes: Uint8Array): string[] {
  const s = bin(bytes); notePdf(s); const out: string[] = [];
  for (const m of s.matchAll(/\/Length (\d+)\b[^]*?>>\s*stream\r?\n/g)) { let body = s.slice(m.index! + m[0].length, m.index! + m[0].length + Number(m[1])); try { body = bin(unzlibSync(Uint8Array.from(body, c => c.charCodeAt(0)))); } catch { /* raw */ } out.push(body); }
  return out;
}
/** Text runs with their x position (pdf-lib writes "1 0 0 1 x y Tm <hex> Tj"). */
export function runs(stream: string): { x: number; y: number; t: string }[] {
  return [...stream.matchAll(/([\d.-]+) ([\d.-]+) Tm\s*<([0-9A-Fa-f]*)> Tj/g)].map(m => ({ x: +m[1], y: +m[2], t: decodeHex(m[3]) }));
}
export const raw = bin;
