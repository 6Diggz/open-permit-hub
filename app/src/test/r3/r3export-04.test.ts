import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
import { streams, runs } from './_r3x_pdf';
import { PDFDocument } from 'pdf-lib';
// r3export-04: only A-1 has a title block and preparer signature line. A-2 (floor plan) and G-2 (markup) have a one-line
// footer: no owner, preparer, signature/date line, sheet number box. LADBS correction item I.C.1 asks for each plan sheet signed.
it('every sheet carries the preparer signature line and the address', async () => {
  const p = demoProject(); p.people.preparerName = 'Pat Drafter'; p.people.preparerRole = 'designer' as any;
  p.markup.pins = [{ id: 'a', n: 1, x: p.adu.footprint[0].x, y: p.adu.footprint[0].y, comment: 'x', status: 'open', author: 'r', at: '2026-10-20' }];
  const bytes = await sheetsPDF(p, 'handoff'); const n = (await PDFDocument.load(bytes)).getPageCount(); expect(n).toBe(4); // A-1, A-2, G-2, A-0 letter plot plan
  const pages = streams(bytes).map(s => runs(s).map(r => r.t).join('\n')).filter(t => t.length > 20);
  expect(pages.length).toBe(4);
  for (const t of pages) { expect(t).toMatch(/Signature of preparer: Pat Drafter/); expect(t).toContain('123 Example St'); }
});
