import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
// r3export-03: sheets use the non-embedded base-14 Helvetica (pymupdf: Helvetica, Helvetica-Bold, ext 'n/a').
// ePlanLA/ProjectDox and PDF/A expect embedded fonts; a reviewer's viewer substitutes and text widths shift.
it('every font in the sheet PDF is embedded', async () => {
  const d = await PDFDocument.load(await sheetsPDF(demoProject(), 'handoff'));
  const fonts = d.context.enumerateIndirectObjects().map(([, o]) => o).filter((o): o is PDFDict => o instanceof PDFDict && String(o.get(PDFName.of('Type'))) === '/Font' && String(o.get(PDFName.of('Subtype'))) !== '/Type0');
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) expect(f.has(PDFName.of('FontDescriptor')), 'not embedded: ' + String(f.get(PDFName.of('BaseFont')))).toBe(true);
});
