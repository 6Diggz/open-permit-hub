import type { Project } from '../core/model';
import type { Report } from './engine';
import type { Route, SheetItem } from './ladbs-adu-2025';
import { packById } from './registry';

/** mayApply: a document whose trigger (grading, shared driveway, vehicle lift...) the app does not ask about; the preparer decides. */
export type ItemState = 'covered' | 'autoPassed' | 'failing' | 'needsAnswer' | 'docsMissing' | 'mayApply';
export interface Readiness { /** Name of the checklist these items come from (per pack). */ sheet: { en: string; es: string }; total: number; checked: number; covered: number; autoPassed: number; failing: number; needsAnswer: number; docsMissing: number; mayApply: number; items: { item: SheetItem; state: ItemState; why: string }[] }

export function projectRoute(p: Project): Route | 'unknown' {
  if (p.adu.mode !== 'conversion') return 'new';
  return p.adu.garageAttachment === 'unknown' ? 'unknown' : p.adu.garageAttachment;
}

/** Which sheet items apply to this project (garage path routing, AB 2533 legalization). */
export function applies(i: SheetItem, p: Project): boolean {
  if (i.mode === 'na-garage') return false;
  const r = projectRoute(p);
  if (i.route && r !== 'unknown' && !i.route.includes(r)) return false;
  if (p.adu.legalization && i.id.startsWith('II.') && !i.hs) return false;
  return true;
}

/** "Ready to submit" score against the full LADBS sheet: X of N sheet items checked. */
export function readiness(p: Project, rep: Report): Readiness {
  // OUT-15: items come from the pack that made the report (LADBS sheet for LA City, DPW checklist for the County beta).
  const pk = packById(rep.pack); const CATALOG = pk.catalog, RULE_ITEMS = pk.ruleItems;
  const sheet = pk.meta.sheet.name ?? { en: 'LADBS correction-sheet', es: 'la hoja de correcciones de LADBS' };
  const byItem = new Map<string, string[]>();
  for (const [rule, ids] of Object.entries(RULE_ITEMS)) ids.forEach(id => byItem.set(id, [...(byItem.get(id) ?? []), rule]));
  const items = CATALOG.map(item => {
    if (!applies(item, p)) return { item, state: 'covered' as ItemState, why: 'does not apply' };
    const rs = rep.results.filter(r => byItem.get(item.id)?.includes(r.rule.id));
    if (rs.length) {
      if (rs.some(r => r.status === 'FAIL' && !r.dismissed)) return { item, state: 'failing' as ItemState, why: 'a check fails' };
      if (rs.some(r => r.status === 'UNKNOWN' || r.status === 'NOT_CHECKED')) return { item, state: (item.mode === 'doc' ? 'docsMissing' : 'needsAnswer') as ItemState, why: 'needs an answer' };
      // Only a PASS is an automatic pass. A note (INFO) from a health-and-safety rule still needs a preparer's answer; other notes count as covered.
      if (rs.some(r => r.status === 'INFO' && r.rule.hs && !r.dismissed)) return { item, state: 'needsAnswer' as ItemState, why: 'a safety note to confirm' };
      // A passing rule covers an auto item. An ask or doc item still needs the user's own answer or attachment.
      if (item.mode === 'auto') return { item, state: (rs.every(r => r.status === 'PASS') ? 'autoPassed' : 'covered') as ItemState, why: 'checked' };
    }
    if (item.mode === 'doc') return { item, state: (p.docs[item.id] ? 'covered' : item.garageRelevant ? 'docsMissing' : 'mayApply') as ItemState, why: p.docs[item.id] ? 'attached' : item.garageRelevant ? 'not attached' : 'may apply: ask your preparer' };
    const a = p.sheet[item.id];
    if (a === 'yes' || a === 'na') return { item, state: 'covered' as ItemState, why: a === 'na' ? 'does not apply' : 'shown on plans' };
    return { item, state: (a === 'no' ? 'failing' : 'needsAnswer') as ItemState, why: a === 'no' ? 'not on plans yet' : 'not answered' };
  });
  // r6logic-03: a failing check that lands on no applicable sheet item still counts as one item to fix, so every surface agrees.
  const failingIds = new Set(items.filter(x => x.state === 'failing').map(x => x.item.id));
  const orphanFails = rep.results.filter(r => r.status === 'FAIL' && !r.dismissed && !(RULE_ITEMS[r.rule.id] ?? []).some(id => failingIds.has(id))).length;
  const n = (s: ItemState) => items.filter(x => x.state === s).length + (s === 'failing' ? orphanFails : 0);
  const covered = n('covered'), autoPassed = n('autoPassed');
  return { sheet, total: items.length, checked: covered + autoPassed, covered, autoPassed, failing: n('failing'), needsAnswer: n('needsAnswer'), docsMissing: n('docsMissing'), mayApply: n('mayApply'), items };
}

/** One plain-language line: what is done, what is left, and who does it. */
export const scoreLine = (r: Readiness, es = false) => {
  const left = r.needsAnswer + r.docsMissing + r.failing;
  return es
    ? `${r.checked} de ${r.total} puntos de ${r.sheet.es} están listos. Quedan ${left}: ${r.failing} por corregir, ${r.needsAnswer} preguntas sin responder (muchas son para su preparador) y ${r.docsMissing} documentos por adjuntar. Otros ${r.mayApply} pueden aplicar: pregunte a su preparador`
    : `${r.checked} of ${r.total} ${r.sheet.en} items are done. ${left} left: ${r.failing} to fix, ${r.needsAnswer} questions to answer (many are for your preparer) and ${r.docsMissing} documents to attach. ${r.mayApply} more may apply: ask your preparer`;
};

/**
 * Reviewed allow list (r5gold-01): checks that may stay "need info" under a "Likely yes". Each is a detail the preparer
 * designs on the plans (alarms, energy, vapor retarder, engineering, room layout, ceiling finish, escape window size), not a
 * question of whether the garage can become an ADU at all. A rule not on this list blocks "Likely yes" until someone adds it here.
 */
// r6logic-04: ENG-01 (wall material is a homeowner fact; unreinforced masonry is a seismic risk) and EGR-01 (a bedroom may have
// no escape window at all) were removed: their FAIL value is a homeowner fact, not a preparer design detail.
export const MAY_STAY_OPEN: readonly string[] = ['ALM-01', 'ALM-02', 'VAP-01', 'NRG-01', 'ROM-01', 'CEI-01'];
export type PlainVerdict = 'likely-yes' | 'likely-no' | 'unsure';
/**
 * The homeowner's question in one short sentence: "Can I turn my garage into an ADU?". Never stronger than the checks:
 * "likely yes" needs LA City, a known residential zone, the four map overlays answered "no" and no failing check.
 * It always says how many checks ran and how many questions are left, and that it is not a city answer.
 */
export function plainAnswer(p: Project, rep: Report): { verdict: PlainVerdict; en: string; es: string } {
  const c = rep.counts; const fails = rep.results.filter(r => r.status === 'FAIL' && !r.dismissed).length;
  // r5whole-04: the counts said here are the same numbers as the score line under it (LADBS sheet items), so one card never shows two stories.
  const rd = readiness(p, rep);
  const checks = c.PASS + c.INFO, left = rd.needsAnswer, docs = rd.docsMissing; // r4gold-02: switched-off checks are open questions too (needsAnswer)
  const what = p.adu.mode === 'conversion' ? { en: 'this garage', es: 'este garaje' } : { en: 'this lot', es: 'este lote' };
  // r5gold-06: singular and plural in both languages.
  const qEn = `${left} question${left === 1 ? '' : 's'} left${docs ? `, ${docs} document${docs === 1 ? '' : 's'} to attach` : ''}`, qEs = `${left === 1 ? 'queda 1 pregunta' : `quedan ${left} preguntas`}${docs ? `, ${docs} documento${docs === 1 ? '' : 's'} por adjuntar` : ''}`;
  // r5gold-04: "not sure yet" is not "outside LA": ask to confirm the city first.
  if (p.site.jurisdiction === 'unknown')
    return { verdict: 'unsure', en: `Not sure yet: first confirm which city the lot is in (look up the address on ZIMAS or your property tax bill), so the right rules can be checked.`, es: `No se sabe aún: primero confirme en qué ciudad está el lote (busque la dirección en ZIMAS o en su recibo de impuestos), para revisar las reglas correctas.` };
  if (p.site.jurisdiction === 'la-county' && !rep.pack.startsWith('la-county@'))
    return { verdict: 'unsure', en: `Not sure: this tool's checked rules cover the City of Los Angeles only, and this lot is in unincorporated LA County. You can try the County beta ("Beta: LA County (unincorporated)" on the Lot step); until then it cannot say if ${what.en} can become an ADU.`, es: `No se sabe: las reglas revisadas de esta herramienta son solo para la Ciudad de Los Ángeles, y este lote está en el condado de LA no incorporado. Puede probar la beta del condado en el paso Lote; hasta entonces no puede decir si ${what.es} puede ser una ADU.` };
  if (!rep.pack.startsWith(p.site.jurisdiction + '@')) // r4juris-04: any jurisdiction with its own pack can answer
    return { verdict: 'unsure', en: `Not sure: this tool's rules cover the City of Los Angeles only, so it cannot say if ${what.en} can become an ADU yet.`, es: `No se sabe: las reglas de esta herramienta son solo para la Ciudad de Los Ángeles, así que no puede decir aún si ${what.es} puede ser una ADU.` };
  // r4gold-03: an LA City project the rules do not cover gets its own reason (duplex, new story, date), not the city one.
  if (rep.overall === 'NOT_SUPPORTED') { const u = rep.results.find(r => r.unsupported || (r.status === 'FAIL' && r.rule.id === 'JUR-01'));
    return { verdict: 'unsure', en: `Not sure: this app does not check this kind of project yet. ${u ? u.msg.en : ''}`.trim(), es: `No se sabe: esta app aún no revisa este tipo de proyecto. ${u ? u.msg.es : ''}`.trim() }; }
  const fx = rd.failing; // r6logic-03: no fudge; readiness counts every failing check
  if (fails > 0)
    return { verdict: 'likely-no', en: `Not as entered: ${fx === 1 ? '1 sheet item' : `${fx} sheet items`} to fix before ${what.en} can become an ADU; ${qEn}.`, es: `No como está: ${fx === 1 ? '1 punto de la hoja' : `${fx} puntos de la hoja`} por corregir antes de que ${what.es} pueda ser una ADU; ${qEs}.` };
  const f = p.site.flags; const zone = p.site.zone.trim().toUpperCase();
  // r4gold-04: RAS is a commercial/residential mixed zone; a lot in two zones is not a plain answer.
  const split = /[/,;&]|\sAND\s/.test(zone);
  // OUT-15: County zones are written with a hyphen (R-1, R-A, A-1) or RPD (Title 22).
  const countyRes = !split && rep.pack.startsWith('la-county@') && /^(R-[1-4A]|A-[12]|RPD)\b/.test(zone);
  const residential = countyRes || !split && !/^(\[?Q\]?|\(T\)|\(Q\))*\s*RAS/.test(zone) && /^(\[?Q\]?|\(T\)|\(Q\))*\s*(R[1-5SAEWDU]|RD|RE|RS|RA|RW|RU|RZ|A[12]|R\d)/.test(zone);
  // r4gold-02: these checks decide the answer, so it cannot be "likely yes" while any is open or a module is off.
  // r5gold-01: deny by default. Every check must be PASS or INFO; only the reviewed list below may stay open.
  const gate = rep.results.some(r => (r.status === 'UNKNOWN' || r.status === 'NOT_CHECKED') && !MAY_STAY_OPEN.includes(r.rule.id)) || Object.values(p.modules).some(v => !v);
  const special = (['hillside', 'vhfhsz', 'hpoz', 'coastal', 'fireRebuild'] as const).filter(k => f[k] === 'yes');
  const unknownMap = (['hillside', 'vhfhsz', 'hpoz', 'coastal', 'fireRebuild'] as const).filter(k => f[k] === 'unknown');
  if (!residential || special.length || unknownMap.length || gate)
    return { verdict: 'unsure', en: `Maybe ${what.en} can become an ADU: no blockers found in ${checks} rule checks, but ${!zone ? 'the zone is not known' : split ? 'the lot is in more than one zone' : !residential ? `zone ${zone.slice(0, 20)} is not a plain residential zone` : special.length ? 'this lot is in a special area with extra review' : unknownMap.length ? 'some map questions are not answered' : 'some key answers are still open or some checks are switched off'}; ${qEn}.`,
      es: `Tal vez ${what.es} puede ser una ADU: no se encontraron bloqueos en ${checks} revisiones de reglas, pero ${!zone ? 'no se sabe la zona' : split ? 'el lote está en más de una zona' : !residential ? `la zona ${zone.slice(0, 20)} no es residencial simple` : special.length ? 'este lote está en un área especial con revisión extra' : unknownMap.length ? 'faltan preguntas del mapa' : 'faltan respuestas clave o hay revisiones apagadas'}; ${qEs}.` };
  // OUT-15: a beta pack never says "Likely yes" (no human-reviewed golden cases yet).
  if (packById(rep.pack).beta) return { verdict: 'unsure', en: `Maybe ${what.en} can become an ADU: no blockers found in ${checks} beta County rule checks, but the County rules are a beta that no reviewer has checked yet; ${qEn}. Ask LA County Public Works.`,
    es: `Tal vez ${what.es} puede ser una ADU: no se encontraron bloqueos en ${checks} revisiones beta del condado, pero ninguna persona ha revisado aún estas reglas beta; ${qEs}. Pregunte a Obras Públicas del condado.` };
  return { verdict: 'likely-yes', en: `Likely yes, ${what.en} can become an ADU: no blockers found in ${checks} rule checks; ${qEn} for you or your preparer.`,
    es: `Probablemente sí, ${what.es} puede ser una ADU: no se encontraron bloqueos en ${checks} revisiones de reglas; ${qEs} para usted o su preparador.` };
}
