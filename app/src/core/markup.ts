import type { Pin, Project, Response } from './model';
import { bbox } from './geom';

export const nextPinNumber = (pins: Pin[]) => pins.reduce((m, x) => Math.max(m, x.n), 0) + 1;

/** Item starts in city correction letters: "1.", "12)", "(3)", "A.", "III-F.1", "II.C.5", "Item 4:", "Comment #3 -". */
const START = /^\s*(?:(?:[Ii]tem|ITEM|[Cc]omment|COMMENT|[Cc]orrection|CORRECTION)\s*#?\s*)?(\d{1,3}[.)]|\(\d{1,3}\)|[A-Z][.)]|[IVX]{1,4}[-.][A-Z](?:[.-]\d{1,2}){0,2}[.):]?|\d{1,3}\s*[-:])\s+/;
/** A sub-item under a numbered item: "a.", "b)", "(c)". */
const SUB = /^\s*\(?([a-z])[.)]\s+/;
const BULLET = /^\s*[•*·▪◦-]\s+/;
/** Page furniture: "Page 2 of 5", "-- Page 3 --", and the checker's signature/date line. */
const NOISE = /^\s*(?:-*\s*page\s+\d+(?:\s+of\s+\d+)?\s*-*|(?:plan\s+checker|checked\s+by|reviewed\s+by|signature)\b.*)$/i;
/** A section heading such as "I. GENERAL" or "A. ZONING": a short all-caps title, not a correction. */
const heading = (rest: string) => rest.length < 48 && !/[a-z0-9]/.test(rest) && /[A-Z]{3}/.test(rest);

/**
 * Split a pasted correction letter into items. Numbered or lettered lines start an item; lines after it belong to it.
 * Sub-items ("a.") keep their parent number ("2a"), bullets stay inside their item, and page headers that repeat on
 * every page, page footers and the signature line are dropped. With no numbering, blank lines separate items.
 */
export function parseLetter(text: string): { ref: string; text: string }[] {
  const all = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, ''));
  const count = new Map<string, number>(); all.forEach(l => { const k = l.trim(); if (k) count.set(k, (count.get(k) ?? 0) + 1); });
  // A line that repeats word for word is a page header (it is never a correction: corrections carry their own number).
  const lines = all.filter(l => !NOISE.test(l) && !((count.get(l.trim()) ?? 0) > 1 && !START.test(l)));
  const items: { ref: string; text: string }[] = []; let cur: { ref: string; text: string } | null = null; let top = '';
  const numbered = lines.filter(l => START.test(l)).length >= 2;
  if (numbered) {
    for (const l of lines) {
      const m = l.match(START), sub = top && /^\d/.test(top) ? l.match(SUB) : null;
      if (sub) { if (cur) items.push(cur); cur = { ref: top + sub[1], text: l.slice(sub[0].length).trim() }; continue; }
      if (m) {
        const rest = l.slice(m[0].length).trim();
        if (heading(rest)) { if (cur) items.push(cur); cur = null; top = ''; continue; }
        if (cur) items.push(cur); top = m[1].replace(/[.):\s-]+$/, '').replace(/^\(/, ''); cur = { ref: top, text: rest }; continue;
      }
      if (cur && l.trim()) cur.text += (BULLET.test(l) ? '; ' : ' ') + l.replace(BULLET, '').trim();
    }
    if (cur) items.push(cur);
    return items.filter(i => i.text.length > 0).slice(0, 500).map(i => ({ ref: i.ref, text: i.text.slice(0, 2000) }));
  }
  for (const para of lines.join('\n').split(/\n\s*\n/)) { const t = para.replace(/\s+/g, ' ').trim(); if (t.length > 3) items.push({ ref: '', text: t }); }
  return items.slice(0, 500).map((i, k) => ({ ref: String(k + 1), text: i.text.slice(0, 2000) }));
}

/** Default spot for a new pin when it isn't placed by tapping: the ADU, nudged so pins don't stack. */
export function defaultPinSpot(p: Project): { x: number; y: number } {
  const b = bbox(p.adu.footprint); const k = p.markup.pins.length % 9;
  return { x: (b.minX + b.maxX) / 2 + ((k % 3) - 1) * 1200, y: (b.minY + b.maxY) / 2 + (Math.floor(k / 3) - 1) * 1200 };
}

/** Plain-text response letter: one numbered answer per correction item, for the preparer to paste or attach. */
export function responseLetter(p: Project, es = false): string {
  const head = es ? `Respuesta a correcciones\n${p.site.address || p.name}  APN ${p.site.apn || '-'}\n` : `Response to plan check corrections\n${p.site.address || p.name}  APN ${p.site.apn || '-'}\n`;
  // Answers come out in the letter's own order (1, 2, 2a, 10, III-F.1), and every line of an answer stays indented under its item.
  const ind = (t: string) => t.replace(/\r\n?/g, '\n').split('\n').map(x => x.trim()).filter(Boolean).join('\n      ');
  const rows = [...p.markup.responses].sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true })).map((r: Response) => {
    const pin = r.pinId ? p.markup.pins.find(x => x.id === r.pinId) : undefined;
    return `${r.ref}. ${ind(r.text)}\n   ${es ? 'Respuesta' : 'Response'}: ${ind(r.response) || (es ? '(sin respuesta)' : '(no response yet)')}${r.sheet ? `\n   ${es ? 'Hoja' : 'Sheet'}: ${r.sheet}` : ''}${pin ? `\n   ${es ? 'Pin' : 'Pin'} ${pin.n}` : ''}\n   ${r.done ? (es ? 'Hecho' : 'Done') : (es ? 'Pendiente' : 'Open')}`;
  });
  return [head, ...rows].join('\n\n') + '\n';
}

export type SortKey = 'n' | 'comment' | 'status' | 'author' | 'at';
export function sortPins(pins: Pin[], key: SortKey, dir: 1 | -1): Pin[] {
  return [...pins].sort((a, b) => { const x = a[key], y = b[key]; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return (c || a.n - b.n) * dir; });
}
