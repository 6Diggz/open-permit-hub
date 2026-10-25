// Embedded fonts for every PDF sheet and report: Public Sans (SIL OFL 1.1, the app's own UI font), whole font (stable glyph ids; about 25 KB per weight).
// Plan-intake systems (ePlanLA / ProjectDox) and PDF/A expect embedded fonts; base-14 Helvetica is never embedded.
import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { unzlibSync } from 'fflate';
import regular from '@fontsource/public-sans/files/public-sans-latin-400-normal.woff?inline';
import bold from '@fontsource/public-sans/files/public-sans-latin-700-normal.woff?inline';

const bytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), c => c.charCodeAt(0));
/** WOFF 1.0 -> TrueType (sfnt): inflate each table and lay them out again. A PDF FontFile2 must be TrueType, not WOFF. */
export function woffToTtf(w: Uint8Array): Uint8Array {
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength); if (dv.getUint32(0) !== 0x774f4646) return w;
  const n = dv.getUint16(12); const tabs = [];
  for (let i = 0; i < n; i++) { const o = 44 + i * 20; const off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8), orig = dv.getUint32(o + 12);
    const raw = w.subarray(off, off + comp); tabs.push({ tag: dv.getUint32(o), sum: dv.getUint32(o + 16), data: comp < orig ? unzlibSync(raw) : raw }); }
  let size = 12 + n * 16; for (const t of tabs) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size); const ov = new DataView(out.buffer);
  let sel = 0; while (2 << sel <= n) sel++; const range = (1 << sel) * 16;
  ov.setUint32(0, dv.getUint32(4)); ov.setUint16(4, n); ov.setUint16(6, range); ov.setUint16(8, sel); ov.setUint16(10, n * 16 - range);
  let at = 12 + n * 16;
  tabs.forEach((t, i) => { const o = 12 + i * 16; ov.setUint32(o, t.tag); ov.setUint32(o + 4, t.sum); ov.setUint32(o + 8, at); ov.setUint32(o + 12, t.data.length); out.set(t.data, at); at += (t.data.length + 3) & ~3; });
  return out;
}

/** Regular and bold, embedded. Falls back to Helvetica only if the font cannot be read (the export still works). */
const cache = new WeakMap<PDFDocument, Promise<{ f: PDFFont; fb: PDFFont }>>();
export function sheetFonts(doc: PDFDocument): Promise<{ f: PDFFont; fb: PDFFont }> {
  let c = cache.get(doc); if (!c) { c = load(doc); cache.set(doc, c); } return c;
}
async function load(doc: PDFDocument): Promise<{ f: PDFFont; fb: PDFFont }> {
  try { doc.registerFontkit(fontkit); return { f: await doc.embedFont(woffToTtf(bytes(regular)), { subset: false }), fb: await doc.embedFont(woffToTtf(bytes(bold)), { subset: false }) }; }
  catch { return { f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold) }; }
}
