import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { readiness, scoreLine } from '../rules/readiness';
import { RULE_ITEMS } from '../rules/ladbs-adu-2025';
import { PACK, packFreshness } from '../rules/pack';
import { citeEs } from '../rules/cites-es';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Accessible check report: real headings, lists and lang, readable by screen readers (the PDF is untagged). All text escaped. */
export function reportHTML(p: Project, rep: Report, lang: 'en' | 'es' = p.people.language): string {
  const es = lang === 'es'; const fr = packFreshness();
  const label: Record<string, string> = { FAIL: es ? 'Corregir' : 'Fix', UNKNOWN: es ? 'Falta info' : 'Need info', PASS: es ? 'Cumple' : 'Pass', NOT_CHECKED: es ? 'No revisado' : 'Not checked', INFO: es ? 'Nota' : 'Note' };
  const ov = { READY_FOR_PREPARER: es ? 'Listo para su preparador' : 'Ready for your preparer', FIX_ISSUES: es ? 'Hay cosas que corregir' : 'Issues to fix', INCOMPLETE: es ? 'Incompleto: falta información' : 'Incomplete: information missing', NOT_SUPPORTED: es ? 'Dirección no soportada' : 'Address not supported' }[rep.overall];
  const order = ['FAIL', 'UNKNOWN', 'NOT_CHECKED', 'INFO', 'PASS'];
  const items = [...rep.results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).map(r => `<li><h3>${esc(label[r.status])}: ${esc(r.rule.id)} ${esc(r.rule.title[lang])}</h3><p>${esc(r.msg[lang])}</p>${r.next ? `<p><strong>${es ? 'Siguiente paso' : 'Next step'}:</strong> ${esc(r.next[lang])}</p>` : ''}${r.dismissed ? `<p>${es ? 'Descartado por el usuario' : 'Dismissed by user'}: ${esc(r.dismissed)}</p>` : ''}<p><small>${esc(r.rule.cites.map(c => (c.edition ? `[${c.edition}] ` : '') + (es ? citeEs(c.code) : c.code) + (c.verified ? '' : es ? ' [cita en verificación]' : ' [citation pending verification]')).join('; '))}${RULE_ITEMS[r.rule.id]?.length ? esc(`; ${es ? 'hoja' : 'sheet'} ${RULE_ITEMS[r.rule.id].join(', ')}`) : ''}</small></p></li>`).join('\n');
  return `<!doctype html><html lang="${es ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(p.name)} - ${es ? 'informe de revisión' : 'check report'}</title>
<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1e2228;background:#fff}h3{font-size:1rem;margin:0}li{margin:0 0 1rem}small{color:#4a515c}</style></head>
<body><main><p>${es ? 'Revisión por software, no una revisión de la ciudad' : 'Software check, not a city review'}</p>
<h1>${esc(p.name)}</h1><p>${esc(p.site.address || '-')} · APN ${esc(p.site.apn || '-')}</p>
<h2>${esc(ov)}</h2><p>${es ? 'Reglas vigentes al' : 'Rules as of'} ${esc(rep.vestDate)} · ${esc(rep.pack)} · ${esc(es ? fr.reasonEs : fr.reason)}</p>
<p>${es ? 'Revisiones de reglas' : 'Rule checks'}: ${label.PASS} ${rep.counts.PASS}, ${label.FAIL} ${rep.counts.FAIL}, ${label.UNKNOWN} ${rep.counts.UNKNOWN}, ${label.NOT_CHECKED} ${rep.counts.NOT_CHECKED}</p>
<p>${es ? 'Puntos de la hoja LADBS' : 'LADBS sheet items'}: ${esc(scoreLine(readiness(p, rep), es))} (${esc(PACK.sheet.form)} Rev ${esc(PACK.sheet.rev)})</p>
<h2>${es ? 'Resultados' : 'Results'}</h2><ul>${items}</ul>
<p>${es ? 'Esta herramienta no aprueba planos. Solo la ciudad aprueba.' : 'This tool does not approve plans. Only the city does.'}</p></main></body></html>`;
}
