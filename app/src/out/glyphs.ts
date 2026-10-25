import type { Project } from '../core/model';
/** Characters the built-in PDF fonts can print (WinAnsi). Others print as "?" and are listed in a note. */
const PRINTABLE = /[\x20-\x7E -ÿ–—‘’“”•…€]/u;
export const unprintable = (s: string) => [...new Set([...s].filter(c => !PRINTABLE.test(c) && !/\s/.test(c)))];
export const safe = (s: string) => [...s].map(c => (PRINTABLE.test(c) ? c : /\s/.test(c) ? ' ' : '?')).join('');
/** Every user-typed field that prints on a sheet. */
const typed = (p: Project) => [p.name, p.site.address, p.site.apn, p.people.ownerName, p.people.preparerName, p.people.preparerLicense, p.people.engineerName, ...p.adu.windows.map(w => w.room)].join(' ');
const cp = (c: string) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
/** `pdf`: list code points only (the note itself must be printable). */
export const missingGlyphNote = (p: Project, es = false, pdf = false) => { const u = unprintable(typed(p)).map(c => (pdf ? cp(c) : `${c} (${cp(c)})`)); return u.length ? (es ? `Estos caracteres aún no se pueden imprimir en el PDF y salen como "?": ${u.join(', ')}` : `These characters can't print in this PDF yet and show as "?": ${u.join(', ')}`) : ''; };
