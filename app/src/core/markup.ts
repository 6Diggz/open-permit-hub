import type { Pin, Project, Response } from './model';
import { bbox } from './geom';

export const nextPinNumber = (pins: Pin[]) => pins.reduce((m, x) => Math.max(m, x.n), 0) + 1;

/** Item starts in city correction letters: "1.", "12)", "(3)", "A.", "III-F.1", "II.C.5", "Item 4:", bullets. */
const START = /^\s*(?:item\s+)?((?:\d{1,3}|[A-Z])[.)]|\(\d{1,3}\)|[IVX]{1,4}[-.][A-Z](?:[.-]\d{1,2}){0,2}[.):]?|\d{1,3}\s*[-:]|[•*•-])\s+/i;

/**
 * Split a pasted correction letter into items. Numbered or lettered lines start an item; lines after it belong to it.
 * With no numbering, blank lines separate items. Page headers/footers ("Page 2 of 5") are dropped.
 */
export function parseLetter(text: string): { ref: string; text: string }[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => !/^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i.test(l));
  const items: { ref: string; text: string }[] = []; let cur: { ref: string; text: string } | null = null;
  const numbered = lines.filter(l => START.test(l)).length >= 2;
  if (numbered) {
    for (const l of lines) {
      const m = l.match(START);
      if (m) { if (cur) items.push(cur); cur = { ref: m[1].replace(/[.):\s-]+$/, '').replace(/^\(/, '').replace(/^[•*•-]$/, ''), text: l.slice(m[0].length).trim() }; }
      else if (cur && l.trim()) cur.text += ' ' + l.trim();
    }
    if (cur) items.push(cur);
  } else {
    for (const para of text.split(/\n\s*\n/)) { const t = para.replace(/\s+/g, ' ').trim(); if (t.length > 3) items.push({ ref: '', text: t }); }
  }
  return items.filter(i => i.text.length > 0).slice(0, 500).map((i, k) => ({ ref: i.ref || String(k + 1), text: i.text.slice(0, 2000) }));
}

/** Default spot for a new pin when it isn't placed by tapping: the ADU, nudged so pins don't stack. */
export function defaultPinSpot(p: Project): { x: number; y: number } {
  const b = bbox(p.adu.footprint); const k = p.markup.pins.length % 9;
  return { x: (b.minX + b.maxX) / 2 + ((k % 3) - 1) * 1200, y: (b.minY + b.maxY) / 2 + (Math.floor(k / 3) - 1) * 1200 };
}

/** Plain-text response letter: one numbered answer per correction item, for the preparer to paste or attach. */
export function responseLetter(p: Project, es = false): string {
  const head = es ? `Respuesta a correcciones\n${p.site.address || p.name}  APN ${p.site.apn || '-'}\n` : `Response to plan check corrections\n${p.site.address || p.name}  APN ${p.site.apn || '-'}\n`;
  const rows = p.markup.responses.map((r: Response) => {
    const pin = r.pinId ? p.markup.pins.find(x => x.id === r.pinId) : undefined;
    return `${r.ref}. ${r.text}\n   ${es ? 'Respuesta' : 'Response'}: ${r.response || (es ? '(sin respuesta)' : '(no response yet)')}${r.sheet ? `\n   ${es ? 'Hoja' : 'Sheet'}: ${r.sheet}` : ''}${pin ? `\n   ${es ? 'Pin' : 'Pin'} ${pin.n}` : ''}\n   ${r.done ? (es ? 'Hecho' : 'Done') : (es ? 'Pendiente' : 'Open')}`;
  });
  return [head, ...rows].join('\n\n') + '\n';
}

export type SortKey = 'n' | 'comment' | 'status' | 'author' | 'at';
export function sortPins(pins: Pin[], key: SortKey, dir: 1 | -1): Pin[] {
  return [...pins].sort((a, b) => { const x = a[key], y = b[key]; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return (c || a.n - b.n) * dir; });
}
