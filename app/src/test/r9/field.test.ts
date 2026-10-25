// r5field-06/08/09/11 and appsec-08.
import { describe, it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { demoProject } from '../../core/model';
import { encryptText, openPack, serialize, MAX_PACK_BYTES, passphraseProblem } from '../../core/permitpack';
import { blankInspection, sanitizeInspection, planHints, tzLabel, inspectionPack } from '../../core/inspection';
import { orphanPhotos } from '../../core/photos';
import { makePassphrase, randIndex, WORDS, BITS_PER_WORD } from '../../core/passgen';
import { EFF_WORDS } from '../../core/eff-words';
import { getVerdict } from '../../core/verdict';
import { inspectionPDF } from '../../out/inspectpdf';
import { extractPages } from '../../io/plancheck';
import { History } from '../../core/undo';

describe('r5field-06 photos survive undo', () => {
  it('only images no saved project uses are collected', () => { expect(orphanPhotos(['a1', 'b2', 'c3'], new Set(['b2']))).toEqual(['a1', 'c3']); });
  it('undo after Remove photo brings back an id that is still kept (no delete until the next start)', () => {
    const p = demoProject(); p.inspection = { ...blankInspection(), items: { egress: { s: 'pass', note: '', photo: 'ph-0001-keep', at: '' } } };
    const h = new History(p); const q = structuredClone(p); q.inspection!.items.egress.photo = null; h.push(q); h.undo();
    const used = new Set([h.present.inspection!.items.egress.photo!]); expect(orphanPhotos(['ph-0001-keep'], used)).toEqual([]);
  });
});

describe('r5field-08 locked visit pack', () => {
  it('locks the visit text with its photos and opens with the passphrase only', async () => {
    const p = demoProject(); p.inspection = { ...blankInspection(), inspector: 'Lock Test', items: { egress: { s: 'fail', note: 'small', photo: 'ph-egress-0001', at: '' } } };
    const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const { text } = inspectionPack(serialize(p), { 'ph-egress-0001': jpg }, Math.floor(MAX_PACK_BYTES * 0.74));
    const locked = await encryptText(text, 'pelican-oxygen-drift-salad');
    expect(locked).not.toContain('Lock Test'); expect(JSON.parse(locked).format).toBe('permitpack-encrypted');
    await expect(openPack(locked, 'wrong-passphrase-here')).rejects.toThrow(/Wrong passphrase/);
    const back = await openPack(locked, 'pelican-oxygen-drift-salad'); expect(back.inspection?.inspector).toBe('Lock Test');
  });
  it('refuses a weak passphrase', async () => { await expect(encryptText('{}', 'password')).rejects.toThrow(); });
});

describe('r5field-09 permit, stage, type, time zone, page X of N', () => {
  it('keeps valid values and drops bad ones', () => {
    const i = sanitizeInspection({ items: {}, permit: '25010-10000-01234<script>', stage: 'frame', kind: 'electrical', tz: 'America/Los_Angeles' })!;
    expect(i.permit).toBe('25010-10000-01234script'); expect(i.stage).toBe('frame'); expect(i.kind).toBe('electrical'); expect(i.tz).toBe('America/Los_Angeles');
    const j = sanitizeInspection({ items: {}, stage: 'roof', kind: 'x', tz: 'bad zone!' })!; expect(j.stage).toBeUndefined(); expect(j.kind).toBeUndefined(); expect(j.tz).toBeUndefined();
  });
  it('time zone label', () => { expect(['PDT', 'PST', 'GMT-7', 'GMT-8']).toContain(tzLabel('2026-10-25T09:30', 'America/Los_Angeles')); expect(tzLabel('2026-10-25T09:30', '')).toBe(''); });
  it('the PDF prints permit, stage, type, time zone and Page X of N', async () => {
    const p = demoProject(); p.inspection = { ...blankInspection(), inspector: 'R. I.', permit: '25010-10000-01234', stage: 'final', kind: 'building', tz: 'America/Los_Angeles', items: { egress: { s: 'pass', note: '', photo: null, at: '2026-07-01T09:30' } } };
    const { pages } = await extractPages(await inspectionPDF(p, {}, 'en'), pdfjs as any); const all = pages.flatMap(x => x.lines).join('\n');
    expect(all).toContain('Permit: 25010-10000-01234'); expect(all).toMatch(/Stage: Final/); expect(all).toMatch(/Type: Building/);
    expect(all).toContain('America/Los_Angeles'); expect(all).toMatch(/2026-07-01 09:30 (PDT|GMT-7)/);
    const n = pages.length; expect(n).toBeGreaterThan(1); for (let i = 1; i <= n; i++) expect(all).toContain(`Page ${i} of ${n}`);
  });
});

describe('r5field-11 checklist reads the project', () => {
  it('sprinklers: required, or not required and likely N/A', () => {
    const p = demoProject(); p.site.flags.primarySprinklered = 'no'; p.adu.sprinklered = 'no';
    let h = planHints(p, getVerdict(p).report, 'en'); expect(h.get('sprk')!.text.join(' ')).toMatch(/Not required/); expect(h.get('sprk')!.na).toBe(true);
    p.site.flags.primarySprinklered = 'yes'; h = planHints(p, getVerdict(p).report, 'en'); expect(h.get('sprk')!.text.join(' ')).toMatch(/^Required/); expect(h.get('sprk')!.na).toBe(false);
  });
  it('escape window sizes, ceiling, bedrooms and all-electric come from the project', () => {
    const p = demoProject(); p.adu.rooms = []; p.adu.windows = [{ id: 'w1', room: 'Bedroom', sleeping: true, clearWidthMm: 24 * 25.4, clearHeightMm: 36 * 25.4, sillMm: 42 * 25.4, gradeFloor: true }]; p.adu.ceilingHeightMm = 8 * 304.8; p.adu.allElectric = 'yes';
    const h = planHints(p, getVerdict(p).report, 'en');
    expect(h.get('egress')!.text.join(' ')).toContain('Bedroom: 24" x 36" clear (6.0 sq ft), sill 42"');
    expect(h.get('ceiling')!.text.join(' ')).toContain("8' 0\""); expect(h.get('gas')!.na).toBe(true);
    const es = planHints(p, getVerdict(p).report, 'es'); expect(es.get('egress')!.text.join(' ')).toContain('libre');
  });
});

describe('appsec-08 generated passphrase', () => {
  it('word list is the full EFF large list, unique', () => { expect(EFF_WORDS.length).toBe(7776); expect(new Set(EFF_WORDS).size).toBe(7776); expect(EFF_WORDS[0]).toBe('abacus'); });
  it('5 words, over 64 bits, accepted by the lock, different each time', () => {
    const a = makePassphrase(), b = makePassphrase(); expect(a.split('-').length).toBeGreaterThanOrEqual(WORDS); expect(a).not.toBe(b);
    expect(WORDS * BITS_PER_WORD).toBeGreaterThan(64); expect(passphraseProblem(a)).toBeNull();
  });
  it('no modulo bias: values at or above the cutoff are redrawn', () => {
    const seq = [0xffffffff, 7777]; let i = 0; expect(randIndex(7776, a => { a[0] = seq[i++]; })).toBe(1); expect(i).toBe(2);
  });
});
