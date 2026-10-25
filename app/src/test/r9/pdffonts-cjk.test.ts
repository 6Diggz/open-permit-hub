// OUT2-17: names in Korean, Chinese and Farsi print in the PDFs with lazily loaded Noto fonts; a Latin-only PDF loads none.
import { it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { base, run } from '../r3/golden_base';
import { reportPDF } from '../../out/pdf';
import { missingGlyphNote } from '../../out/glyphs';
import { scriptsNeeded } from '../../out/pdffonts';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
const fontsOf = async (b: Uint8Array) => { const d = await PDFDocument.load(b); const out: string[] = [];
  for (const [, o] of d.context.enumerateIndirectObjects()) if (o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Font')) out.push(String(o.get(PDFName.of('BaseFont')) ?? '')); return out; };
const text = async (b: Uint8Array) => { const d = await (pdfjs as any).getDocument({ data: b.slice(), useSystemFonts: false }).promise; let s = ''; for (let i = 1; i <= d.numPages; i++) s += (await (await d.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(''); return s; };
it('scriptsNeeded picks only the families the text needs', () => {
  expect(scriptsNeeded('John Smith')).toEqual({ cjk: [], arabic: false });
  expect(scriptsNeeded('김민준')).toEqual({ cjk: ['kr'], arabic: false });
  expect(scriptsNeeded('陳大文', 'zh-Hant').cjk).toEqual(['tc']); expect(scriptsNeeded('陈大文').cjk).toEqual(['sc']);
  expect(scriptsNeeded('مریم احمدی').arabic).toBe(true);
});
it.each([['김민준', /NotoSansKR/], ['陈大文', /NotoSansSC/], ['مریم احمدی', /NotoSansArabic/]])('PDF prints owner name %s with its own font', async (n, font) => {
  const p = base(); p.people.ownerName = n; p.name = n; expect(missingGlyphNote(p, false, true)).toBe('');
  const b = await reportPDF(p, run(p).rep, 'en') as Uint8Array; const fs = await fontsOf(b); expect(fs.some(f => font.test(f)), fs.join(',')).toBe(true);
  const t = (await text(b)).normalize('NFKC'); if (!/[\u0600-\u06ff]/.test(n)) expect(t).toContain(n); else for (const w of n.split(' ')) expect(t, w).toContain(w);
}, 30000);
it('a Latin-only PDF embeds no CJK or Arabic font', async () => {
  const p = base(); p.people.ownerName = 'Ana Ruiz'; const b = await reportPDF(p, run(p).rep, 'en') as Uint8Array;
  expect((await fontsOf(b)).filter(f => /NotoSans(KR|SC|TC|Arabic)/.test(f))).toEqual([]);
});

import { shapeArabic, visualOrder } from '../../out/arabic';
it('r4reach-11 Farsi letters are shaped by position (isolated, final, initial, medial) and lam-alef joins', () => {
  // م initial, ر final (right-joining), ی initial (after a non-forward-joining letter), م final
  expect([...shapeArabic('مریم')].map(c => c.codePointAt(0)!.toString(16))).toEqual(['fee3', 'feae', 'fbfe', 'fee2']);
  expect(shapeArabic('لا')).toBe('\ufefb'); expect(shapeArabic('سلام').normalize('NFKC')).toBe('سلام');
  expect(shapeArabic('می\u200cخواهم')).not.toContain('\u200c');
});
it('r4reach-11 an Arabic run keeps its letters for fontkit and reverses its word order; Latin text is untouched', () => {
  expect(visualOrder('John Smith')).toBe('John Smith');
  const v = visualOrder('Owner: مریم احمدی'); expect(v.startsWith('Owner: ')).toBe(true);
  expect(v.slice(7).normalize('NFKC')).toBe('احمدی مریم');
});
it('Persian digits are reported as not printable (they would misprint), Latin digits print', () => {
  const p = base(); p.site.address = 'پلاک ۱۲۳'; expect(missingGlyphNote(p, false, true)).toMatch(/U\+06F1/);
  p.site.address = 'پلاک 123'; expect(missingGlyphNote(p, false, true)).toBe('');
});
