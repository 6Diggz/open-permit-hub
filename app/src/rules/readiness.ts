import type { Project } from '../core/model';
import type { Report } from './engine';
import { CATALOG, RULE_ITEMS, type Route, type SheetItem } from './ladbs-adu-2025';

export type ItemState = 'covered' | 'autoPassed' | 'failing' | 'needsAnswer' | 'docsMissing';
export interface Readiness { total: number; checked: number; covered: number; autoPassed: number; failing: number; needsAnswer: number; docsMissing: number; items: { item: SheetItem; state: ItemState; why: string }[] }

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
  const byItem = new Map<string, string[]>();
  for (const [rule, ids] of Object.entries(RULE_ITEMS)) ids.forEach(id => byItem.set(id, [...(byItem.get(id) ?? []), rule]));
  const items = CATALOG.map(item => {
    if (!applies(item, p)) return { item, state: 'covered' as ItemState, why: 'does not apply' };
    const rs = rep.results.filter(r => byItem.get(item.id)?.includes(r.rule.id));
    if (rs.length) {
      if (rs.some(r => r.status === 'FAIL' && !r.dismissed)) return { item, state: 'failing' as ItemState, why: 'a check fails' };
      if (rs.some(r => r.status === 'UNKNOWN' || r.status === 'NOT_CHECKED')) return { item, state: (item.mode === 'doc' ? 'docsMissing' : 'needsAnswer') as ItemState, why: 'needs an answer' };
      return { item, state: (item.mode === 'auto' ? 'autoPassed' : 'covered') as ItemState, why: 'checked' };
    }
    if (item.mode === 'doc') return { item, state: (p.docs[item.id] ? 'covered' : 'docsMissing') as ItemState, why: p.docs[item.id] ? 'attached' : 'not attached' };
    const a = p.sheet[item.id];
    if (a === 'yes' || a === 'na') return { item, state: 'covered' as ItemState, why: a === 'na' ? 'does not apply' : 'shown on plans' };
    return { item, state: (a === 'no' ? 'failing' : 'needsAnswer') as ItemState, why: a === 'no' ? 'not on plans yet' : 'not answered' };
  });
  const n = (s: ItemState) => items.filter(x => x.state === s).length;
  const covered = n('covered'), autoPassed = n('autoPassed');
  return { total: items.length, checked: covered + autoPassed, covered, autoPassed, failing: n('failing'), needsAnswer: n('needsAnswer'), docsMissing: n('docsMissing'), items };
}

export const scoreLine = (r: Readiness, es = false) => es
  ? `${r.checked} de ${r.total} puntos de la hoja revisados (${r.autoPassed} automáticos, ${r.covered} cubiertos, ${r.needsAnswer} sin respuesta, ${r.docsMissing} documentos faltan, ${r.failing} por corregir)`
  : `${r.checked} of ${r.total} sheet items checked (${r.autoPassed} auto-passed, ${r.covered} covered, ${r.needsAnswer} need an answer, ${r.docsMissing} docs missing, ${r.failing} to fix)`;
