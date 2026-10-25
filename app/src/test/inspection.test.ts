/// <reference types="node" />
// Inspector field mode: checklist data, file round trip with photos, the size cap, and the PDF record.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { demoProject } from '../core/model';
import { migrate, serialize, MAX_PACK_BYTES } from '../core/permitpack';
import { INSP_ITEMS, sanitizeInspection, sanitizePhotos, inspectionPack, tally, blankInspection, PHOTO_MAX_BYTES } from '../core/inspection';
import { getPhoto } from '../core/photos';
import { inspectionPDF } from '../out/inspectpdf';
import { extractPages } from '../io/plancheck';
import { CATALOG } from '../rules/ladbs-adu-2025';
import { ES } from '../ui/es';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDKooorzj6MKKKKACiiigAooooAKKKKACiiigD/2Q==';
const jpegBytes = () => Uint8Array.from(atob(JPEG.split(',')[1]), c => c.charCodeAt(0));
const visit = () => { const p = demoProject(); p.inspection = { ...blankInspection(), inspector: 'R. Inspector', date: '2026-10-25', general: 'Gate code 1234',
  items: { egress: { s: 'fail', note: 'Sill at 46 in', photo: 'ph-egress-0001', at: '2026-10-25T09:10' }, smoke: { s: 'pass', note: '', photo: null, at: '2026-10-25T09:12' }, sprk: { s: 'na', note: '', photo: null, at: '' } } }; return p; };

describe('field mode checklist', () => {
  it('every item points at real LADBS sheet items and has both languages', () => {
    expect(INSP_ITEMS.length).toBeGreaterThanOrEqual(20); expect(new Set(INSP_ITEMS.map(x => x.id)).size).toBe(INSP_ITEMS.length);
    for (const x of INSP_ITEMS) { expect(x.en && x.es).toBeTruthy(); expect(x.es).not.toBe(x.en); x.sheet.forEach(id => expect(CATALOG.some(c => c.id === id), id).toBe(true)); }
  });
  it('counts results', () => { const t = tally(visit().inspection); expect(t).toMatchObject({ pass: 1, fail: 1, na: 1, photos: 1, total: INSP_ITEMS.length, open: INSP_ITEMS.length - 3 }); expect(tally(undefined).open).toBe(INSP_ITEMS.length); });
  it('never trusts a file: unknown items, bad statuses, long notes and odd photo ids are dropped or capped', () => {
    const i = sanitizeInspection({ inspector: 5, date: 'nope', items: { egress: { s: 'maybe', note: 'x'.repeat(5000), photo: '../../etc' }, evil: { s: 'pass' }, smoke: 'yes' } })!;
    expect(i.inspector).toBe(''); expect(i.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(Object.keys(i.items)).toEqual(['egress']);
    expect(i.items.egress).toMatchObject({ s: null, photo: null }); expect(i.items.egress.note.length).toBe(1000);
    expect(sanitizeInspection(null)).toBeUndefined(); expect(sanitizeInspection('x')).toBeUndefined();
  });
  it('keeps only JPEG photos the visit uses, under the size cap', () => {
    const ins = visit().inspection!;
    const out = sanitizePhotos({ 'ph-egress-0001': JPEG, 'ph-other-00001': JPEG, x: 'data:text/html;base64,PHNjcmlwdD4=' }, ins); expect(Object.keys(out)).toEqual(['ph-egress-0001']);
    expect(sanitizePhotos({ 'ph-egress-0001': 'data:image/jpeg;base64,' + 'A'.repeat(PHOTO_MAX_BYTES * 2) }, ins)).toEqual({});
    expect(sanitizePhotos({ 'ph-egress-0001': 'data:image/png;base64,AAAA' }, ins)).toEqual({});
  });
});

describe('field mode in the .permitpack', () => {
  it('round-trips results and photos; the photo goes to the device store, never into the saved project', async () => {
    const p = visit(); const { text, left } = inspectionPack(serialize(p), { 'ph-egress-0001': JPEG }, MAX_PACK_BYTES); expect(left).toEqual([]);
    const back = migrate(JSON.parse(text));
    expect(back.inspection?.items.egress).toMatchObject({ s: 'fail', note: 'Sill at 46 in', photo: 'ph-egress-0001' }); expect(back.inspection?.inspector).toBe('R. Inspector');
    expect((back as any).inspectionPhotos).toBeUndefined(); expect(serialize(back)).not.toContain('base64');
    const b = await getPhoto('ph-egress-0001'); expect(b?.size).toBe(jpegBytes().length);
  });
  it('a pack without a visit opens with no visit (old files keep working)', () => { const p = demoProject(); expect(migrate(JSON.parse(serialize(p))).inspection).toBeUndefined(); });
  it('photos that would push the file over the 5 MB pack cap are left out and listed', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(140_000); const photos: Record<string, string> = {}; for (let i = 0; i < 40; i++) photos['ph-' + String(i).padStart(8, '0')] = big;
    const { text, left } = inspectionPack(serialize(visit()), photos, MAX_PACK_BYTES); expect(text.length).toBeLessThanOrEqual(MAX_PACK_BYTES); expect(left.length).toBeGreaterThan(0); expect(left.length).toBeLessThan(40);
  });
});

describe('site visit PDF record', () => {
  for (const lang of ['en', 'es'] as const) it(`prints every item, results, notes and the photo (${lang})`, async () => {
    const bytes = await inspectionPDF(visit(), { 'ph-egress-0001': jpegBytes() }, lang);
    const { pages } = await extractPages(bytes, pdfjs as any); const text = pages.flatMap(p => p.lines).join('\n');
    expect(text).toContain(lang === 'es' ? 'Registro de visita a la obra' : 'Site visit record'); expect(text).toContain('R. Inspector'); expect(text).toContain('Sill at 46 in'); expect(text).toContain('Gate code 1234');
    for (const x of INSP_ITEMS) expect(text.replace(/\s+/g, ' '), x.id).toContain(x[lang].split(' ').slice(0, 3).join(' '));
    expect(text).toContain(lang === 'es' ? 'NO CUMPLE' : 'FAIL'); expect(text).toContain(lang === 'es' ? 'NO APLICA' : 'N/A');
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/DCTDecode');
  });
  it('says when a photo is not on this device instead of failing', async () => {
    const { pages } = await extractPages(await inspectionPDF(visit(), {}, 'en'), pdfjs as any); expect(pages.flatMap(p => p.lines).join(' ')).toContain('photo not on this device');
  });
  it('an empty visit still prints (every item not checked)', async () => {
    const p = demoProject(); const { pages } = await extractPages(await inspectionPDF(p, {}, 'en'), pdfjs as any); expect(pages.flatMap(x => x.lines).filter(l => l.includes('NOT CHECKED')).length).toBe(INSP_ITEMS.length);
  });
});

describe('Spanish for the new screens', () => {
  it('every L() string in the pre-check and field mode screens has Spanish', () => {
    const dir = new URL('../ui/', import.meta.url); const missing: string[] = []; let seen = 0;
    for (const f of ['FieldMode.tsx', 'PlanCheck.tsx', 'Review.tsx']) { const s = readFileSync(new URL(f, dir), 'utf8');
      for (const m of s.matchAll(/\bL\('((?:[^'\\]|\\.)*)'\)/g)) { seen++; const k = m[1].replace(/\\'/g, "'"); if (!(k in (ES as Record<string, string>))) missing.push(`${f}: ${k}`); } }
    expect(seen).toBeGreaterThan(80); expect(missing).toEqual([]); expect(readdirSync(dir).includes('es-feat.ts')).toBe(true);
  });
});
