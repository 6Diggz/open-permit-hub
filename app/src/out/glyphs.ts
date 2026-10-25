import type { Project } from '../core/model';
/** Characters the built-in PDF fonts can print (WinAnsi). Others print as "?" and are listed in a note. */
// r4reach-10: plus Latin Extended, Vietnamese, Cyrillic and Armenian (fallback fonts in pdffonts.ts).
// OUT2-17: plus Hangul, CJK and Arabic script (Farsi), loaded lazily in pdffonts.ts only when the text has them.
const PRINTABLE = /[\x20-\x7E -ÿ–—‘’“”•…€\u0100-\u024F\u0300-\u0301\u0303\u0309\u0323\u1EA0-\u1EF9\u0400-\u052F\u0531-\u058A\u20AB\u1100-\u11FF\u3000-\u303F\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u0600-\u065F\u066A-\u06EF\u06FA-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D]/u;
export const unprintable = (s: string) => [...new Set([...s].filter(c => !PRINTABLE.test(c) && !/\s/.test(c)))];
export const safe = (s: string) => [...s].map(c => (PRINTABLE.test(c) ? c : /\s/.test(c) ? ' ' : '?')).join('');
/** Every user-typed field that prints on a sheet. */
export const typed = (p: Project) => [p.name, p.site.address, p.site.apn, p.people.ownerName, p.people.preparerName, p.people.preparerLicense, p.people.engineerName, ...p.adu.windows.map(w => w.room)].join(' ');
const cp = (c: string) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
/** `pdf`: list code points only (the note itself must be printable). */
export const missingGlyphNote = (p: Project, es = false, pdf = false) => { const u = unprintable(typed(p)).map(c => (pdf ? cp(c) : `${c} (${cp(c)})`)); return u.length ? (es ? `Estos caracteres aún no se pueden imprimir en el PDF y salen como "?": ${u.join(', ')}` : `These characters can't print in this PDF yet and show as "?": ${u.join(', ')}`) : ''; };
