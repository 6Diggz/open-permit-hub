// Test helper: turn the hex strings in a PDF's Tj operators back into text. Sheets embed Public Sans as a CID font
// (Identity-H, 4 hex digits = one glyph id), so ids are mapped through the font's own character map, the same job the
// PDF's ToUnicode map does for a real viewer. Base-14 fallback text (2 hex digits = one byte) is read as before.
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
const byGid = new Map<number, string>();
for (const w of ['400', '700']) {
  const font = fontkit.create(readFileSync(new URL(`../../node_modules/@fontsource/public-sans/files/public-sans-latin-${w}-normal.woff`, import.meta.url)));
  for (const cp of font.characterSet) { const g = font.glyphForCodePoint(cp); if (g && !byGid.has(g.id)) byGid.set(g.id, String.fromCodePoint(cp)); }
}
/** Call with the whole PDF (binary string) so later decodes know whether it uses the embedded CID font. */
export const notePdf = (_whole: string) => { /* kept for callers; detection is per string */ };
export function decodeHex(hex: string, _whole?: string): string {
  // Glyph ids in this font are under 512, so a CID string has every 4-digit group starting 00 or 01; plain text bytes never do.
  if (hex.length % 4 === 0 && hex.length && /^(?:0[01][0-9A-Fa-f]{2})+$/.test(hex)) return (hex.match(/.{4}/g) ?? []).map(h => byGid.get(parseInt(h, 16)) ?? '?').join('');
  return (hex.match(/../g) ?? []).map(h => String.fromCharCode(parseInt(h, 16))).join('');
}
