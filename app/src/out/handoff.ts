import { zipSync, strToU8 } from 'fflate';
import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { toDXF } from './dxf';
import { reportPDF, sheetsPDF } from './pdf';
import { reportHTML } from './reporthtml';
import { takeoff, takeoffCSV } from './takeoff';
import { serialize } from '../core/permitpack';
import { readiness, scoreLine } from '../rules/readiness';
import { PACK, PACK_ID } from '../rules/pack';
import notices from '../../public/THIRD_PARTY_NOTICES.txt?raw';

/** Handoff packet for the human preparer of record (no diagonal watermark; title-block note only). Every file carries one pack id. */
export async function handoffZip(p: Project, rep: Report): Promise<Uint8Array> {
  const rd = readiness(p, rep);
  const pick = (s: string) => rd.items.filter(x => x.state === s);
  const readme = [`Handoff packet: ${p.name}`, '', 'For the preparer of record. Finalize, verify in the field, and submit through ePlanLA yourself.',
    `Rule pack: ${PACK_ID} (rules checked ${PACK.verifiedOn}). LADBS sheet ${PACK.sheet.form} Rev ${PACK.sheet.rev} cites ${PACK.sheet.codes}.`,
    'Contents: site-plan.pdf (true scale, 24x36: A-1 site plan, A-2 floor plan data), site-plan.dxf (DXF 2018, units inches), check-report-en.pdf, check-report-es.pdf, check-report-en.html and check-report-es.html (screen-reader friendly), materials.csv, project.permitpack, THIRD_PARTY_NOTICES.txt', '',
    `LADBS correction sheet ${PACK.sheet.form} Rev ${PACK.sheet.rev}: ${scoreLine(rd)}`, '',
    'Documents still missing:', ...pick('docsMissing').map(x => `- ${x.item.id} ${x.item.summary.en}`), '',
    'May apply: ask your preparer (depends on grading, shared driveways, lifts and other facts this app does not ask about):', ...pick('mayApply').map(x => `- ${x.item.id} ${x.item.summary.en}`), '',
    'Sheet items to fix or answer:', ...rd.items.filter(x => x.state === 'failing' || x.state === 'needsAnswer').map(x => `- ${x.item.id} [${x.why}] ${x.item.summary.en}`), '',
    'Red cards (must resolve before submittal):', ...rep.results.filter(r => r.status === 'FAIL' || (r.status === 'UNKNOWN' && r.rule.kind === 'city')).map(r => `- ${r.rule.id} ${r.rule.title.en}: ${r.next?.en ?? r.msg.en}`)].join('\r\n');
  return zipSync({
    'README.txt': strToU8(readme),
    'site-plan.pdf': await sheetsPDF(p, 'handoff'),
    'site-plan.dxf': await toDXF(p),
    'check-report-en.pdf': await reportPDF(p, rep, 'en'),
    'check-report-es.pdf': await reportPDF(p, rep, 'es'),
    'check-report-en.html': strToU8(reportHTML(p, rep, 'en')),
    'check-report-es.html': strToU8(reportHTML(p, rep, 'es')),
    'materials.csv': strToU8(takeoffCSV(takeoff(p))),
    'project.permitpack': strToU8(serialize({ ...p, rulePack: PACK_ID })),
    'THIRD_PARTY_NOTICES.txt': strToU8(notices),
  });
}
