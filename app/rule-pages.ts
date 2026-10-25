// Static, indexable pages: one per rule (English and Spanish) plus an index and a sitemap, built from the same rule pack the app runs.
import { RULES } from './src/rules/la-city.ts';
import { PACK, PACK_ID } from './src/rules/pack.ts';
import { RULE_ITEMS } from './src/rules/ladbs-adu-2025.ts';
import { citeText } from './src/rules/cites-es.ts';

const SITE = 'https://6diggz.github.io/open-permit-hub/';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** meta: description (not the title again), canonical URL and the other-language URL (hreflang). */
const page = (lang: 'en' | 'es', title: string, body: string, depth: number, meta: { desc: string; url: string; en: string; es: string }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(meta.desc)}"><link rel="canonical" href="${meta.url}"><link rel="alternate" hreflang="en" href="${meta.en}"><link rel="alternate" hreflang="es" href="${meta.es}"><link rel="alternate" hreflang="x-default" href="${meta.en}"><link rel="sitemap" type="application/xml" href="${SITE}sitemap.xml"><link rel="icon" href="${'../'.repeat(depth)}icon.svg"><style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1e2228;background:#fff}a{color:#1d4ed8}small{color:#4a515c}@media(prefers-color-scheme:dark){body{background:#111316;color:#e8eaed}a{color:#8ab4ff}small{color:#a2a9b4}}</style></head><body><main>${body}</main></body></html>`;

export function rulePages(): Record<string, string> {
  const out: Record<string, string> = {}; const urls: string[] = [];
  for (const lang of ['en', 'es'] as const) {
    const es = lang === 'es'; const dir = es ? 'rules/es/' : 'rules/'; const depth = es ? 2 : 1; const app = '../'.repeat(depth);
    const list = RULES.map(r => `<li><a href="${r.id}.html">${esc(r.id)}: ${esc(r.title[lang])}</a></li>`).join('');
    out[dir + 'index.html'] = page(lang, es ? 'Reglas de conversión de garaje a ADU en Los Ángeles' : 'LA garage-to-ADU conversion rules', `<h1>${es ? 'Reglas de conversión de garaje a ADU en la Ciudad de Los Ángeles' : 'City of Los Angeles garage-to-ADU conversion rules'}</h1><p>${es ? 'Lo que revisa Open Permit Hub, con su fuente. Resúmenes propios, no el texto del código.' : 'What Open Permit Hub checks, with the source for each. Our own summaries, not code text.'} ${esc(PACK_ID)}, ${es ? 'revisadas el' : 'checked'} ${PACK.verifiedOn}.</p><ul>${list}</ul><p><a href="${app}">${es ? 'Revise su garaje gratis' : 'Check your garage for free'}</a> · <a href="${es ? '../' : 'es/'}">${es ? 'English' : 'Español'}</a></p>`, depth,
      { desc: es ? `Las ${RULES.length} revisiones que hace Open Permit Hub para convertir un garaje en ADU en la Ciudad de Los Ángeles, con su fuente. Reglas revisadas el ${PACK.verifiedOn}.` : `The ${RULES.length} checks Open Permit Hub runs for a City of Los Angeles garage-to-ADU conversion, each with its source. Rules checked ${PACK.verifiedOn}.`, url: SITE + dir, en: SITE + 'rules/', es: SITE + 'rules/es/' });
    urls.push(SITE + dir);
    for (const r of RULES) {
      const cites = r.cites.map(c => `<li>${c.url ? `<a href="${esc(c.url)}" rel="noopener">${esc(citeText(c, es))}</a>` : esc(citeText(c, es))}${c.verified ? '' : es ? ' <small>(cita en verificación)</small>' : ' <small>(citation being verified)</small>'}</li>`).join('');
      const items = RULE_ITEMS[r.id]?.length ? `<p>${es ? 'Puntos de la hoja de correcciones LADBS' : 'LADBS correction sheet items'} (${esc(PACK.sheet.form)} Rev ${esc(PACK.sheet.rev)}): ${esc(RULE_ITEMS[r.id].join(', '))}</p>` : '';
      out[`${dir}${r.id}.html`] = page(lang, `${r.id}: ${r.title[lang]} (${es ? 'ADU en LA' : 'LA ADU'})`, `<p><a href="./">${es ? 'Todas las reglas' : 'All rules'}</a></p><h1>${esc(r.title[lang])}</h1><p><small>${esc(r.id)} · ${es ? 'versión' : 'version'} ${esc(r.version)} · ${es ? 'vigente desde' : 'effective from'} ${esc(r.effectiveFrom)} · ${r.hs ? (es ? 'salud y seguridad' : 'health and safety') : ''}</small></p><p>${es ? `Alcance: solo la Ciudad de Los Ángeles (LADBS), conversión de garaje a ADU y ADU nuevo del plan YOU-ADU. Paquete de reglas ${esc(PACK_ID)}, revisado el ${PACK.verifiedOn}.` : `Scope: City of Los Angeles (LADBS) only, garage-to-ADU conversions and new YOU-ADU plan ADUs. Rule pack ${esc(PACK_ID)}, checked ${PACK.verifiedOn}.`}</p><h2>${es ? 'Fuentes' : 'Sources'}</h2><ul>${cites}</ul>${items}<p><a href="${app}">${es ? 'Revise su garaje contra esta regla, gratis' : 'Check your garage against this rule, free'}</a> · <a href="${es ? `../${r.id}.html` : `es/${r.id}.html`}">${es ? 'English' : 'Español'}</a></p><p><small>${es ? 'Revisión por software, no una revisión de la ciudad.' : 'Software check, not a city review.'}</small></p>`, depth,
        { desc: `${r.title[lang]}. ${es ? 'Lo que revisa Open Permit Hub para un ADU de garaje en la Ciudad de Los Ángeles, y su fuente' : 'What Open Permit Hub checks for a City of Los Angeles garage ADU, and its source'}: ${citeText(r.cites[0], es)}`.slice(0, 300), url: `${SITE}${dir}${r.id}.html`, en: `${SITE}rules/${r.id}.html`, es: `${SITE}rules/es/${r.id}.html` });
      urls.push(`${SITE}${dir}${r.id}.html`);
    }
  }
  out['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[SITE, ...urls].map(u => `<url><loc>${u}</loc><lastmod>${PACK.verifiedOn}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  out['robots.txt'] = `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`;
  return out;
}
