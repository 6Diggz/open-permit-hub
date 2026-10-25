// Text runs per page from a pdf-lib generated PDF: decoded string and its baseline y (from the Tm matrix), plus page height.
import { PDFDocument, PDFArray, PDFRawStream, PDFName, decodePDFRawStream } from 'pdf-lib';
export async function pdfRuns(bytes: Uint8Array): Promise<{ height: number; runs: { text: string; y: number }[] }[]> {
  const doc = await PDFDocument.load(bytes); const out = [];
  for (const pg of doc.getPages()) {
    const c = pg.node.get(PDFName.of('Contents')); const refs = c instanceof PDFArray ? c.asArray() : [c];
    let src = '';
    for (const r of refs) { const s = doc.context.lookup(r); if (s instanceof PDFRawStream) src += new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) + '\n'; }
    const runs: { text: string; y: number }[] = []; let y = NaN;
    for (const m of src.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|<([0-9A-Fa-f]*)>\s*Tj/g)) {
      if (m[6] !== undefined) y = Number(m[6]); else runs.push({ text: (m[7].match(/../g) ?? []).map(h => String.fromCharCode(parseInt(h, 16))).join(''), y });
    }
    out.push({ height: pg.getHeight(), runs });
  }
  return out;
}
