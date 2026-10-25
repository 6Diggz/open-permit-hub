import { describe, it, expect } from 'vitest';
import { demoProject } from '../core/model';
import { evaluate } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { toDXF, toDXFR12 } from '../out/dxf';
import { initCleanfix } from './wasm';
import { reportPDF, sheetsPDF } from '../out/pdf';
import { handoffZip } from '../out/handoff';
import { takeoff } from '../out/takeoff';
import { deadlinesICS } from '../out/ics';
import { unzipSync } from 'fflate';
import { PDFDocument, PDFName } from 'pdf-lib';

const p = demoProject(); const rep = evaluate(p, RULES, PACK_ID, new Date('2026-10-24'));
describe('outputs', () => {
  it('DXF is DXF 2018 in inches with closed polylines, dimensions and EOF (parity-11, qa-18)', async () => { initCleanfix(); const d = new TextDecoder().decode(await toDXF(p)); expect(d).toContain('AC1032'); const l = d.split(/\r?\n/).map(x => x.trim()); const i = l.indexOf('$INSUNITS'); expect([l[i + 1], l[i + 2]]).toEqual(['70', '1']); expect(d).toContain('LWPOLYLINE'); expect(d).toContain('DIMENSION'); expect(d).toContain('ADU'); expect(l.filter(Boolean).at(-1)).toBe('EOF'); });
  it('R12 fallback DXF has layers, closed polylines and EOF', () => { const d = toDXFR12(p); expect(d).toContain('AC1009'); expect(d).toContain('POLYLINE'); expect(d.trim().endsWith('EOF')).toBe(true); });
  it('sheet is 24x36 and report has pages', async () => {
    const s = await PDFDocument.load(await sheetsPDF(p, 'draft')); expect(s.getPage(0).getSize()).toEqual({ width: 2592, height: 1728 });
    const r = await PDFDocument.load(await reportPDF(p, rep, 'es')); expect(r.getPageCount()).toBeGreaterThan(0);
  });
  it('handoff zip has all files', async () => { const z = unzipSync(await handoffZip(p, rep)); expect(Object.keys(z).sort()).toEqual(['README.txt', 'THIRD_PARTY_NOTICES.txt', 'check-report-en.html', 'check-report-en.pdf', 'check-report-es.html', 'check-report-es.pdf', 'materials.csv', 'project.permitpack', 'site-plan.dxf', 'site-plan.pdf']); });
  it('handoff README shows the sheet score', async () => { const z = unzipSync(await handoffZip(p, rep)); expect(new TextDecoder().decode(z['README.txt'])).toMatch(/\d+ of \d+ LADBS correction-sheet items are done/); });
  it('takeoff is sane for a 20x20 garage', () => { const t = takeoff(p); const dw = t[0].qty; expect(dw).toBeGreaterThan(20); expect(dw).toBeLessThan(45); });
  it('ics has stable UID and 18-month plan check', () => { const i = deadlinesICS(p, '2026-11-01'); expect(i).toContain(`UID:${p.id}-plancheck`); expect(i).toContain('DTSTART;VALUE=DATE:20280501'); });
});

// ---- Round 1 output regressions ----
import { unzlibSync } from 'fflate';
import { csvCell, takeoffCSV } from '../out/takeoff';
import { addMonths, icsText } from '../out/ics';
import { dxfText, sitePlanSpec } from '../out/dxf';
import { reportHTML } from '../out/reporthtml';
import { errorReport } from '../core/errorreport';
import { buildServiceWorker } from '../../sw-build';
import notices from '../../public/THIRD_PARTY_NOTICES.txt?raw';
import manifest from '../../public/manifest.webmanifest?raw';
import appPkg from '../../package.json';
/** Text drawn on PDF pages (pdf-lib writes hex strings; streams may be Flate-compressed). */
function pdfText(bytes: Uint8Array): string {
  const bin = (u: Uint8Array) => { let r = ''; for (let i = 0; i < u.length; i += 0x8000) r += String.fromCharCode(...u.subarray(i, i + 0x8000)); return r; };
  const s = bin(bytes); let out = '';
  // Read each stream by its /Length (a compressed stream can itself contain the bytes "\nendstream", which made the old
  // regex cut pages short depending on the date printed on the sheet).
  for (const m of s.matchAll(/\/Length (\d+)\b[^]*?>>\s*stream\r?\n/g)) {
    let body = s.slice(m.index! + m[0].length, m.index! + m[0].length + Number(m[1])); try { const raw = Uint8Array.from(body, c => c.charCodeAt(0)); body = bin(unzlibSync(raw)); } catch { /* not compressed */ }
    for (const t of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out += t[1].match(/../g)!.map(h => String.fromCharCode(parseInt(h, 16))).join('') + '\n';
  }
  return out;
}
describe('round 1 outputs', () => {
  it('parity-01 qa-19 CSV escapes inch marks and survives a round trip', () => {
    const csv = takeoffCSV(takeoff(p)); const row = csv.split('\r\n').find(l => l.includes('Studs'))!;
    expect(row).toContain('"16"" on center + corners"');
    const cells = [...row.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"')); expect(cells).toEqual(['Studs for furring/infill (8 ft)', expect.any(String), 'pcs', '16" on center + corners']);
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
  it('parity-02 every export in the ZIP carries one rule pack id', async () => {
    const old = { ...p, rulePack: 'la-city@2026.10.0' }; const z = unzipSync(await handoffZip(old, rep));
    expect(pdfText(z['site-plan.pdf'])).toContain(PACK_ID); expect(pdfText(z['site-plan.pdf'])).not.toContain('2026.10.0');
    expect(pdfText(z['check-report-en.pdf'])).toContain(PACK_ID);
    expect(new TextDecoder().decode(z['site-plan.dxf'])).toContain(PACK_ID);
    expect(JSON.parse(new TextDecoder().decode(z['project.permitpack'])).rulePack).toBe(PACK_ID);
    expect(new TextDecoder().decode(z['README.txt'])).toContain(PACK_ID);
  });
  it('parity-03 report labels rule checks and sheet items separately', async () => { const t = pdfText(await reportPDF(p, rep, 'en')); expect(t).toContain('Rule checks:'); expect(t).toContain('LADBS sheet items:'); });
  it('parity-09 sheet set has an A-2 floor plan data sheet with the window schedule', async () => { const d = await PDFDocument.load(await sheetsPDF(p, 'draft')); expect(d.getPageCount()).toBe(2); const t = pdfText(await sheetsPDF(p, 'draft')); expect(t).toContain('WINDOW SCHEDULE'); expect(t).toContain('EGRESS'); });
  it('parity-10 site plan labels the street and the building separation', async () => {
    const q = { ...p, site: { ...p.site, address: '1234 W 52nd St, Los Angeles' } }; const t = pdfText(await sheetsPDF(q, 'draft'));
    expect(t).toContain('STREET: W 52ND ST'); expect(t).toContain('BUILDING SEPARATION');
    const spec = sitePlanSpec(q); expect(spec.texts.some(x => x.text === 'STREET: W 52ND ST')).toBe(true); expect(spec.dims.some(x => x.text?.includes('BUILDING SEPARATION'))).toBe(true); expect(spec.dims.some(x => x.layer === 'C-PROP-SETB')).toBe(true);
  });
  it('OUT-06 sheets name the preparer and say the software is not the preparer', async () => { const q = { ...p, people: { ...p.people, preparerName: 'Ana Ruiz', preparerRole: 'drafter' as const } }; const t = pdfText(await sheetsPDF(q, 'handoff')); expect(t).toContain('Ana Ruiz (drafter)'); expect(t).toMatch(/software is not the preparer/); });
  it('qa-16 characters the PDF font cannot print are listed, and the PDF still builds', async () => { const q = { ...p, people: { ...p.people, ownerName: '王 שלום 😀' } }; const t = pdfText(await sheetsPDF(q, 'draft')).replace(/\n/g, ' '); expect(t).toContain('U+738B'); expect(t).toContain("can't print in this PDF yet"); });
  it('qa-17 PDFs declare a language and an accessible HTML report exists', async () => {
    const d = await PDFDocument.load(await reportPDF(p, rep, 'es')); expect(String(d.catalog.get(PDFName.of('Lang')))).toContain('es-US');
    const h = reportHTML({ ...p, name: '<script>x</script>' }, rep, 'es'); expect(h).toContain('<html lang="es">'); expect(h).toContain('<h1>&lt;script&gt;x&lt;/script&gt;</h1>'); expect(h).toContain('<h3>');
  });
  it('qa-20 README lists unrelated affidavits under "May apply", not as missing', async () => {
    const r = new TextDecoder().decode(unzipSync(await handoffZip(p, rep))['README.txt']); const missing = r.slice(r.indexOf('Documents still missing:'), r.indexOf('May apply'));
    for (const t of ['Vehicle lift', 'Graffiti', 'Community driveway', 'Grading bond']) { expect(missing).not.toContain(t); expect(r.slice(r.indexOf('May apply'))).toContain(t); }
  });
  it('qa-08 18 months after a month-end filing lands on the last day of the month', () => {
    expect(addMonths('2026-08-31', 18)).toBe('2028-02-29'); expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); expect(addMonths('2027-08-31', 18)).toBe('2029-02-28'); expect(addMonths('2026-11-01', 18)).toBe('2028-05-01');
    expect(deadlinesICS(p, '2026-08-31')).toContain('DTSTART;VALUE=DATE:20280229');
  });
  it('COR-18 permit start and 2-year life are on the calendar when the issue date is known', () => { const i = deadlinesICS(p, '2026-11-01', 0, '2027-03-31'); expect(i).toContain('DTSTART;VALUE=DATE:20280331'); expect(i).toContain('DTSTART;VALUE=DATE:20290331'); expect(i).toContain('2-year'); });
  it('appsec-05 calendar text and ids cannot inject properties', () => {
    const evil = { ...p, id: 'a\r\nATTACH:https://evil.example/x\r\nX' }; const i = deadlinesICS(evil, '2026-11-01');
    expect(i.split('\r\n').some(l => l.startsWith('ATTACH'))).toBe(false); expect(icsText('a;b,c\nd')).toBe('a\\;b\\,c d');
  });
  it('appsec-18 accented letters survive in R12 DXF text', () => { expect(dxfText('Peña')).toBe('Pe\\U+00F1a'); expect(dxfText('a\nb')).toBe('a b'); });
  it('appsec-15 third-party notices ship in the ZIP and name every production dependency and acadrust source', async () => {
    expect(notices).toContain('acadrust 0.6.7 (MPL-2.0)'); expect(notices).toContain('crates.io/crates/acadrust');
    Object.keys(appPkg.dependencies).forEach(d => expect(notices, d).toContain(`== ${d} `));
  });
  it('qa-31 manifest has PNG icons and a maskable icon', () => { const m = JSON.parse(manifest); const s = m.icons.map((i: { sizes: string; purpose?: string }) => i.sizes + (i.purpose ?? '')); expect(s).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512maskable'])); });
  it('OUT-16 error report has no project data', () => { const r = errorReport(new Error('boom at 123 Main St?'), 'Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/140'); const j = JSON.parse(r); expect(j.pack).toBe(PACK_ID); expect(j.ua).not.toContain('Windows'); expect(Object.keys(j)).toEqual(['app', 'pack', 'when', 'ua', 'error', 'stack']); });
  it('qa-06 qa-07 OUT-04 service worker: versioned cache, precaches lazy chunks and WASM, clears old caches', () => {
    const a = buildServiceWorker(['index.html', 'assets/index-A.js', 'assets/pdf-B.js', 'assets/cleanfix_bg-C.wasm', 'sw.js', 'x.js.map'], '<html>1');
    const b = buildServiceWorker(['index.html', 'assets/index-Z.js', 'assets/pdf-B.js', 'assets/cleanfix_bg-C.wasm'], '<html>2');
    expect(a.version).not.toBe(b.version); expect(a.precache).toEqual(expect.arrayContaining(['./assets/pdf-B.js', './assets/cleanfix_bg-C.wasm', './index.html']));
    expect(a.precache).not.toContain('./sw.js'); expect(a.precache.some(f => f.endsWith('.map'))).toBe(false);
    expect(a.source).toContain(`"${a.version}"`); expect(a.source).toContain("k.startsWith('opa-') && k !== C"); expect(a.source).toContain("req.mode === 'navigate'"); expect(a.source).toContain('SKIP_WAITING'); expect(a.source).not.toContain('self.skipWaiting(); e.waitUntil');
  });
});
import { rulePages } from '../../rule-pages';
describe('OUT-14 indexable rule pages', () => {
  it('OUT-14 one page per rule in English and Spanish, plus a sitemap', () => {
    const pages = rulePages(); RULES.forEach(r => { expect(pages[`rules/${r.id}.html`]).toContain(r.title.en); expect(pages[`rules/es/${r.id}.html`]).toContain(r.title.es); });
    expect(pages['sitemap.xml'].match(/<url>/g)!.length).toBe(1 + 2 * (RULES.length + 1)); expect(pages['rules/es/index.html']).toContain('lang="es"');
  });
});
