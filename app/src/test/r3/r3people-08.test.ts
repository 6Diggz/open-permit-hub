import { decodeHex } from '../pdfglyphs';
import { describe, it, expect } from 'vitest';
import { unzlibSync } from 'fflate';
import { sheetsPDF } from '../../out/pdf';
import { demoProject } from '../../core/model';
function pdfText(bytes: Uint8Array): string {
  const bin = (u: Uint8Array) => { let r = ''; for (let i = 0; i < u.length; i += 0x8000) r += String.fromCharCode(...u.subarray(i, i + 0x8000)); return r; };
  const s = bin(bytes); let out = '';
  for (const m of s.matchAll(/\/Length (\d+)\b[^]*?>>\s*stream\r?\n/g)) {
    let body = s.slice(m.index! + m[0].length, m.index! + m[0].length + Number(m[1])); try { body = bin(unzlibSync(Uint8Array.from(body, c => c.charCodeAt(0)))); } catch { /* raw */ }
    for (const t of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += decodeHex(t[1], s) + '\n';
  }
  return out;
}
// What an LADBS plan checker looks for on sheet 1 of a residential set before reading anything else.
describe('r3people-08 sheet set carries LADBS plan-check basics', () => {
  it('has a sheet index, project data / code analysis, zone, lot area and legal description', async () => {
    const t = pdfText(await sheetsPDF(demoProject(), 'draft')).toUpperCase();
    for (const k of ['SHEET INDEX', 'OCCUPANCY', 'CONSTRUCTION TYPE', 'ZONE', 'LOT AREA', 'LEGAL DESCRIPTION', 'VICINITY'])
      expect(t, `missing "${k}" on the sheets`).toContain(k);
  });
});
