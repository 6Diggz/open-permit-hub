// r5whole-01: plan-set pre-check marks III.G.1 / III.F.1 "Appears addressed" (green) when the numbers it read FAIL the sheet.
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r5/tests r5whole-01
import { it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from '../../../node_modules/pdf-lib/es/index.js';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
async function plan() {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  const pg = d.addPage([2592, 1728]); let y = 1650;
  for (const l of ['FLOOR PLAN', 'SHEET A-2', 'Scale: 1/4" = 1\'-0"', "Ceiling height 6'-6\"", 'Egress window 18" x 22" net clear']) { pg.drawText(l, { x: 60, y, size: 14, font: f }); y -= 24; }
  return d.save();
}
it('a ceiling or escape window read below the minimum is never "addressed"', async () => {
  const c = analyze((await extractPages(await plan(), pdfjs as any)).pages);
  const g1 = c.items.find(i => i.id === 'III.G.1')!, f1 = c.items.find(i => i.id === 'III.F.1')!;
  expect(g1.attention).toBeTruthy(); expect(f1.attention).toBeTruthy(); // the module already knows
  expect(g1.state).not.toBe('addressed');
  expect(f1.state).not.toBe('addressed');
});
