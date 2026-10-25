// Coordinator (r5whole-01/02/04/05 root cause): one shared verdict. 10 golden projects; every surface carries the same
// plain answer and the same sheet-item score line.
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { base, ft, inch, rect } from '../r3/golden_base';
import { demoProject, type Project } from '../../core/model';
import { getVerdict } from '../../core/verdict';
import { reportPDF } from '../../out/pdf';
import { reportHTML } from '../../out/reporthtml';
import { handoffZip } from '../../out/handoff';
import { pdfRuns } from '../r3/pdftext';
const T = new Date('2026-10-24T12:00:00');
const cases: [string, () => Project][] = [
  ['base', base], ['demo', demoProject], ['low ceiling', () => { const p = base(); p.adu.ceilingHeightMm = inch(78); return p; }],
  ['hose 180', () => { const p = base(); p.adu.hosePullFt = 180; return p; }], ['hillside', () => { const p = base(); p.site.flags.hillside = 'yes'; return p; }],
  ['unknown city', () => { const p = base(); p.site.jurisdiction = 'unknown'; return p; }], ['fire off', () => { const p = base(); p.modules.fire = false; return p; }],
  ['too tall', () => { const p = base(); p.adu.heightMm = ft(22); return p; }], ['near line', () => { const p = base(); p.adu.footprint = rect(ft(2), ft(124), ft(20), ft(20)); return p; }],
  ['existing ADU', () => { const p = base(); p.site.existingAdus = 1; p.site.existingAduAttached = 'no'; return p; }],
];
for (const [n, mk] of cases) it(`${n}: card, PDF, HTML and README agree`, async () => {
  const p = mk(); const v = getVerdict(p, T); const rep = v.report;
  const head = v.plain.en.split(':')[0];
  const pdf = (await pdfRuns(await reportPDF(p, rep, 'en'))).flatMap(x => x.runs.map(r => r.text)).join(' ').replace(/\s+/g, ' ');
  const html = reportHTML(p, rep, 'en'); const readme = strFromU8(unzipSync(await handoffZip(p, rep))['README.txt']);
  for (const [name, s] of [['pdf', pdf], ['html', html], ['readme', readme]] as const) { expect(s, name).toContain(head); expect(s.replace(/\s+/g, ' '), name).toContain(v.score.en.slice(0, 40)); }
  expect(readme).toContain(v.plain.en);
}, 60000);
