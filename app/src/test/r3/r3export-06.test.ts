import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { sheetsPDF } from '../../out/pdf';
import { streams } from './_r3x_pdf';
// r3export-06: the north arrow is always drawn straight up; the model has no north direction, so typed lots
// (street edge drawn at the bottom) get a wrong arrow whenever the street is not on the south side.
it('north arrow follows the project north direction', async () => {
  const a = demoProject() as any, b = demoProject() as any; a.site.northDeg = 0; b.site.northDeg = 90;
  const sa = streams(await sheetsPDF(a, 'handoff'))[0], sb = streams(await sheetsPDF(b, 'handoff'))[0];
  expect('northDeg' in demoProject().site, 'Project.site needs a north direction field').toBe(true);
  expect(sa).not.toBe(sb);
});
