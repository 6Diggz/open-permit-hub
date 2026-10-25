import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
import { streams, runs } from './_r3x_pdf';
// r3export-05: the title sheet lacks what the app's own LADBS item I.C.8 asks for (area, occupancy, construction type,
// stories, fire zone, lot size, height) and has no sheet index (A-1, A-2, G-2).
it('A-1 title block has the I.C.8 project data and a sheet index', async () => {
  const t = runs(streams(await sheetsPDF(demoProject(), 'handoff'))[0]).map(r => r.t).join('\n');
  for (const k of [/Occupancy/i, /Construction type|Type V/i, /Stories/i, /Lot (size|area)/i, /Height/i, /Sheet index/i, /A-2/]) expect(t).toMatch(k);
});
