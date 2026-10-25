import { decodeHex } from '../pdfglyphs';
import { describe, it, expect } from 'vitest';
import { unzlibSync } from 'fflate';
import { evaluate, exportBlockers } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { blankProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
function pdfText(bytes: Uint8Array): string {
  const bin = (u: Uint8Array) => { let r = ''; for (let i = 0; i < u.length; i += 0x8000) r += String.fromCharCode(...u.subarray(i, i + 0x8000)); return r; };
  const s = bin(bytes); let out = '';
  for (const m of s.matchAll(/\/Length (\d+)\b[^]*?>>\s*stream\r?\n/g)) {
    let body = s.slice(m.index! + m[0].length, m.index! + m[0].length + Number(m[1])); try { body = bin(unzlibSync(Uint8Array.from(body, c => c.charCodeAt(0)))); } catch { /* raw */ }
    for (const t of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += decodeHex(t[1], s) + '\n';
  }
  return out;
}
// Drafter run: project with only an address typed; lot 50x130 and house 30x45 are the app's EXAMPLE numbers (INP-01 = UNKNOWN).
// The handoff ZIP and the city AI pre-check PDF were produced anyway and print 50'0" x 130'0" as if measured.
describe('r3people-09 example sizes never reach a city-facing export unmarked', () => {
  it('blocks the handoff packet and marks every example dimension on the precheck sheet', async () => {
    const p = blankProject(); p.site.jurisdiction = 'la-city'; p.site.address = '1236 W 24th St, Los Angeles, CA 90007';
    const rep = evaluate(p, RULES, PACK_ID);
    expect(rep.results.find(r => r.rule.id === 'INP-01')?.status).toBe('UNKNOWN');
    const blocked = exportBlockers(p, rep).some(b => /example/i.test(b));
    const marked = /EXAMPLE/i.test(pdfText(await sheetsPDF(p, 'precheck')));
    expect(blocked && marked).toBe(true);
  });
});
