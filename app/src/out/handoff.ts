import { zipSync, strToU8 } from 'fflate';
import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { toDXF } from './dxf';
import { reportPDF, sheetsPDF, sheetList } from './pdf';
import { reportHTML } from './reporthtml';
import { takeoff, takeoffCSV } from './takeoff';
import { serialize } from '../core/permitpack';
import { verdictOf } from '../core/verdict';
import { INSP_ITEMS, hasInspection, result, tally, fieldConflicts } from '../core/inspection';
import { inspectionPDF } from './inspectpdf';
import { PACK, PACK_ID } from '../rules/pack';
import notices from '../../public/THIRD_PARTY_NOTICES.txt?raw';

/** Handoff packet for the human preparer of record (no diagonal watermark; title-block note only). Every file carries one pack id. */
export async function handoffZip(p: Project, rep: Report): Promise<Uint8Array> {
  const v = verdictOf(p, rep); const rd = v.readiness; const visit = hasInspection(p);
  // r5whole-03: the site visit travels with the packet (photos from this device when they are there).
  const photos: Record<string, Uint8Array> = {};
  if (visit) try { const { getPhoto } = await import('../core/photos'); for (const x of INSP_ITEMS) { const id = result(p.inspection, x.id).photo; if (!id) continue; const b = await getPhoto(id); if (b) photos[id] = new Uint8Array(await b.arrayBuffer()); } } catch { /* no photo store here (tests, blocked storage) */ }
  const t = tally(p.inspection); const conf = visit ? fieldConflicts(p, rep) : [];
  const pick = (s: string) => rd.items.filter(x => x.state === s);
  const readme = [`Handoff packet: ${p.name}`, '', 'For the preparer of record. Finalize, verify in the field, and submit through ePlanLA yourself.',
    `Answer: ${v.plain.en}`, '',
    `Rule pack: ${PACK_ID} (rules checked ${PACK.verifiedOn}). LADBS sheet ${PACK.sheet.form} Rev ${PACK.sheet.rev} cites ${PACK.sheet.codes}.`,
    `Contents: site-plan.pdf (true scale, 24x36: ${sheetList(p).join(', ')}), site-plan.dxf (DXF 2018, units inches), check-report-en.pdf, check-report-es.pdf, check-report-en.html and check-report-es.html (screen-reader friendly), materials.csv, project.permitpack, ${visit ? 'site-visit.pdf, ' : ''}THIRD_PARTY_NOTICES.txt`, '',
    `LADBS correction sheet ${PACK.sheet.form} Rev ${PACK.sheet.rev}: ${v.score.en}`, '',
    ...(visit ? [`Site visit ${p.inspection!.date} by ${p.inspection!.inspector || '-'}: ${t.pass} pass, ${t.fail} fail, ${t.na} N/A, ${t.open} not checked.`, ...INSP_ITEMS.filter(x => result(p.inspection, x.id).s === 'fail').map(x => `- FAIL ${x.en}${result(p.inspection, x.id).note ? `: ${result(p.inspection, x.id).note.replace(/[\r\n]+/g, ' ').slice(0, 300)}` : ''}`), ...conf.map(id => `- PASS in the field, but the app's checks fail this item: ${INSP_ITEMS.find(x => x.id === id)!.en}. Reason given: ${result(p.inspection, id).note.replace(/[\r\n]+/g, ' ').slice(0, 300) || '(none)'}`), ''] : []),
    'Documents still missing:', ...pick('docsMissing').map(x => `- ${x.item.id} ${x.item.summary.en}`), '',
    'May apply: ask your preparer (depends on grading, shared driveways, lifts and other facts this app does not ask about):', ...pick('mayApply').map(x => `- ${x.item.id} ${x.item.summary.en}`), '',
    'Sheet items to fix or answer:', ...rd.items.filter(x => x.state === 'failing' || x.state === 'needsAnswer').map(x => `- ${x.item.id} [${x.why}] ${x.item.summary.en}`), '',
    'Red cards (must resolve before submittal):', ...rep.results.filter(r => r.status === 'FAIL' || (r.status === 'UNKNOWN' && r.rule.kind === 'city')).map(r => `- ${r.rule.id} ${r.rule.title.en}: ${r.next?.en ?? r.msg.en}`),
    ...(p.markup.pins.length ? ['', `Review notes (sheet G-2): ${p.markup.pins.filter(x => x.status === 'open').length} open`, ...[...p.markup.pins].sort((a, b) => a.n - b.n).map(x => `- ${x.n} [${x.status === 'open' ? 'OPEN' : 'RESOLVED'}] ${x.author || '-'}: ${x.comment.replace(/[\r\n]+/g, ' ').slice(0, 500)}`)] : []),
    ...(p.markup.responses.length ? ['', 'Correction responses:', ...p.markup.responses.map(r => `- ${r.ref} [${r.done ? 'DONE' : 'OPEN'}] ${r.text.replace(/[\r\n]+/g, ' ').slice(0, 300)} -> ${r.response.replace(/[\r\n]+/g, ' ').slice(0, 500) || '(no response yet)'}`)] : [])].join('\r\n');
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
    ...(visit ? { 'site-visit.pdf': await inspectionPDF(p, photos, 'en') } : {}),
    'THIRD_PARTY_NOTICES.txt': strToU8(notices),
  });
}
