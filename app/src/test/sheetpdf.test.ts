// The exported PDF pages, read back with pdf.js (text runs, vector paths and their PDF layers): the same checks e2e/cadviz.mjs
// runs on the screen sheets. No label overlaps, no duplicate dims, 1/8" text, title block fields, true scale, A-2 entities.
import { it, expect } from 'vitest';
import { sheetsPDF } from '../out/pdf';
import { furnished } from './_sheetfix';
import { demoProject } from '../core/model';
// @ts-expect-error plain ES module shared with the browser test
import { check, pdfPage } from '../../e2e/sheetcheck.mjs';

for (const [name, mk] of [['demo', demoProject], ['furnished', furnished]] as const) for (const paper of ['archd', 'tabloid', 'letter'] as const) it(`${name} ${paper} PDF pages pass the sheet checks`, async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const doc = await pdfjs.getDocument({ data: await sheetsPDF(mk(), 'draft', paper) }).promise;
  for (let i = 1; i <= doc.numPages; i++) { const r = check(await pdfPage(pdfjs, doc, i));
    expect(r.over, `page ${i}`).toEqual([]); expect(r.dup, `page ${i}`).toEqual([]); expect(r.minSize).toBeGreaterThanOrEqual(0.125 - 1e-3); expect(r.fields, `page ${i}`).toEqual([]); expect(r.sheetNo, `page ${i}`).toMatch(/^[AG]-/);
    if (r.sheetNo === 'A-2' && name === 'furnished') { expect(r.scale!.err).toBeLessThanOrEqual(1 / 32); for (const l of ['A-WALL', 'A-DOOR', 'A-GLAZ', 'A-DOOR-IDEN', 'A-GLAZ-IDEN', 'A-AREA-IDEN']) expect(r.layers).toContain(l); } }
}, 60000);
