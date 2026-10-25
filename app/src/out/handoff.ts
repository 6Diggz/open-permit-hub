import { zipSync, strToU8 } from 'fflate';
import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { toDXF } from './dxf';
import { reportPDF, sheetsPDF } from './pdf';
import { takeoff, takeoffCSV } from './takeoff';
import { serialize } from '../core/permitpack';
import { readiness, scoreLine } from '../rules/readiness';

/** Handoff packet for the human preparer of record (no diagonal watermark; title-block note only). */
export async function handoffZip(p: Project, rep: Report): Promise<Uint8Array> {
  const rd = readiness(p, rep);
  const readme = [`Handoff packet: ${p.name}`, '', 'For the preparer of record. Finalize, verify in the field, and submit through ePlanLA yourself.',
    'Contents: site-plan.pdf (true scale, 24x36), site-plan.dxf (R12, inches), check-report-en.pdf, check-report-es.pdf, materials.csv, project.permitpack', '',
    `LADBS correction sheet PC/STR/Corr.Lst.20A Rev 10/01/2025: ${scoreLine(rd)}`, '',
    'Documents still missing:', ...rd.items.filter(x => x.state === 'docsMissing').map(x => `- ${x.item.id} ${x.item.summary.en}`), '',
    'Sheet items to fix or answer:', ...rd.items.filter(x => x.state === 'failing' || x.state === 'needsAnswer').map(x => `- ${x.item.id} [${x.why}] ${x.item.summary.en}`), '',
    'Red cards (must resolve before submittal):', ...rep.results.filter(r => r.status === 'FAIL' || (r.status === 'UNKNOWN' && r.rule.kind === 'city')).map(r => `- ${r.rule.id} ${r.rule.title.en}: ${r.next?.en ?? r.msg.en}`)].join('\n');
  return zipSync({
    'README.txt': strToU8(readme),
    'site-plan.pdf': await sheetsPDF(p, 'handoff'),
    'site-plan.dxf': strToU8(toDXF(p)),
    'check-report-en.pdf': await reportPDF(p, rep, 'en'),
    'check-report-es.pdf': await reportPDF(p, rep, 'es'),
    'materials.csv': strToU8(takeoffCSV(takeoff(p))),
    'project.permitpack': strToU8(serialize(p)),
  });
}
