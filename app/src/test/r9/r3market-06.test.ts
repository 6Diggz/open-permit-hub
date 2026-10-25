// r3market-06 / r4reach-04: 11x17 and letter plot plans at a standard scale that fits, scale printed, 9 pt minimum; I.A.1 auto.
import { it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream, PDFName, decodePDFRawStream } from 'pdf-lib';
import { base, run } from '../r3/golden_base';
import { sheetsPDF, fitScale, PLOT_SCALES, PAPER } from '../../out/pdf';
import { pdfRuns } from '../r3/pdftext';
async function sizes(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes); const out: number[][] = [];
  for (const pg of doc.getPages()) { const c = pg.node.get(PDFName.of('Contents')); const refs = c instanceof PDFArray ? c.asArray() : [c]; let src = '';
    for (const r of refs) { const s = doc.context.lookup(r); if (s instanceof PDFRawStream) src += new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()); }
    out.push([...src.matchAll(/\/\S+\s+([\d.]+)\s+Tf/g)].map(m => Number(m[1]))); }
  return { doc, out };
}
for (const paper of ['tabloid', 'letter'] as const) it(`${paper}: one plot plan page, right size, scale printed, no text under 9 pt`, async () => {
  const p = base(); const b = await sheetsPDF(p, 'handoff', paper); const { doc, out } = await sizes(b);
  expect(doc.getPageCount()).toBe(1);
  expect([Math.round(doc.getPage(0).getWidth()), Math.round(doc.getPage(0).getHeight())]).toEqual([PAPER[paper].w * 72, PAPER[paper].h * 72]);
  expect(Math.min(...out[0])).toBeGreaterThanOrEqual(9);
  const text = (await pdfRuns(b))[0].runs.map(r => r.text).join(' ');
  expect(text).toMatch(new RegExp(`Scale .* on ${PAPER[paper].label} sheet`)); expect(text).toMatch(/ADU SETBACK/); expect(text).toMatch(/FEET/);
});
it('the scale is the largest standard one that fits, and a bigger lot gets a smaller scale', () => {
  const [s1] = fitScale(50, 150, 7 * 72, 7 * 72); const [s2] = fitScale(100, 300, 7 * 72, 7 * 72);
  expect(s2).toBeLessThan(s1); expect(150 * s1 * 72).toBeLessThanOrEqual(7 * 72);
  const i = PLOT_SCALES.findIndex(x => x[0] === s1); if (i > 0) expect(150 * PLOT_SCALES[i - 1][0] * 72).toBeGreaterThan(7 * 72);
});
it('the 24x36 set ends with the 8.5x11 plot plan, so I.A.1 is auto', async () => {
  const p = base(); const { rd } = run(p);
  const doc = await PDFDocument.load(await sheetsPDF(p, 'handoff'));
  const last = doc.getPage(doc.getPageCount() - 1); expect([Math.round(last.getWidth()), Math.round(last.getHeight())]).toEqual([612, 792]);
  expect(rd.items.find(i => i.item.id === 'I.A.1')!.item.mode).toBe('auto');
}, 30000);
