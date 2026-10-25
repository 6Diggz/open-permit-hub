import { describe, it, expect } from 'vitest';
import { demoProject } from '../core/model';
import { evaluate } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { toDXF } from '../out/dxf';
import { reportPDF, sheetsPDF } from '../out/pdf';
import { handoffZip } from '../out/handoff';
import { takeoff } from '../out/takeoff';
import { deadlinesICS } from '../out/ics';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

const p = demoProject(); const rep = evaluate(p, RULES, PACK_ID, new Date('2026-10-24'));
describe('outputs', () => {
  it('DXF is R12 with layers and EOF', () => { const d = toDXF(p); expect(d).toContain('AC1009'); expect(d).toContain('ADU'); expect(d.trim().endsWith('EOF')).toBe(true); });
  it('sheet is 24x36 and report has pages', async () => {
    const s = await PDFDocument.load(await sheetsPDF(p, 'draft')); expect(s.getPage(0).getSize()).toEqual({ width: 2592, height: 1728 });
    const r = await PDFDocument.load(await reportPDF(p, rep, 'es')); expect(r.getPageCount()).toBeGreaterThan(0);
  });
  it('handoff zip has all files', async () => { const z = unzipSync(await handoffZip(p, rep)); expect(Object.keys(z).sort()).toEqual(['README.txt', 'check-report-en.pdf', 'check-report-es.pdf', 'materials.csv', 'project.permitpack', 'site-plan.dxf', 'site-plan.pdf']); });
  it('takeoff is sane for a 20x20 garage', () => { const t = takeoff(p); const dw = t[0].qty; expect(dw).toBeGreaterThan(20); expect(dw).toBeLessThan(45); });
  it('ics has stable UID and 18-month plan check', () => { const i = deadlinesICS(p, '2026-11-01'); expect(i).toContain(`UID:${p.id}-plancheck`); expect(i).toContain('DTSTART;VALUE=DATE:20280501'); });
});
