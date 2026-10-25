// pdf.js for the plan-set pre-check, loaded only when a user picks a PDF. The worker is a build asset, so the
// service worker precaches it with every other emitted file and the pre-check works offline after one visit.
import type { extractPages } from './plancheck';
type Lib = Parameters<typeof extractPages>[1];
let lib: Promise<Lib> | null = null;
export function loadPdfJs(): Promise<Lib> {
  lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => { m.GlobalWorkerOptions.workerSrc = w.default; return m as unknown as Lib; })
    .catch(e => { lib = null; throw e; });
  return lib;
}
