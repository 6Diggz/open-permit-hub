// OUT2-10: localStorage -> IndexedDB move is lossless; iOS Safari detection.
import { describe, it, expect } from 'vitest';
import { mergeLegacy, isIosSafari, isProjectKey } from '../../core/kv';
import { blankProject } from '../../core/model';
import { serialize } from '../../core/permitpack';

const proj = (name: string, rev: number) => { const p = blankProject(); p.name = name; return { p, raw: JSON.stringify({ ...JSON.parse(serialize(p)), rev }) }; };
const entry = (id: string, name: string, at: string) => ({ id, name, address: '', updatedAt: at, demo: false });

describe('OUT2-10 mergeLegacy', () => {
  it('copies every localStorage project into an empty IndexedDB, with its list', () => {
    const a = proj('A', 3), b = proj('B', 1);
    const local = { 'opa.index': JSON.stringify([entry(a.p.id, 'A', '2026-01-02'), entry(b.p.id, 'B', '2026-01-01')]), ['opa.p.' + a.p.id]: a.raw, ['opa.p.' + b.p.id]: b.raw, 'opa.lang': 'es' };
    const out = mergeLegacy(new Map(), local);
    expect(out.get('opa.p.' + a.p.id)).toBe(a.raw); expect(out.get('opa.p.' + b.p.id)).toBe(b.raw);
    expect(JSON.parse(out.get('opa.index')!).map((e: any) => e.id).sort()).toEqual([a.p.id, b.p.id].sort());
    expect(out.has('opa.lang')).toBe(false); // preferences stay in localStorage
  });
  it('keeps the newer save when both hold a project (an old tab kept saving to localStorage)', () => {
    const a1 = proj('A old', 2); const a2 = { raw: JSON.stringify({ ...JSON.parse(a1.raw), name: 'A new', rev: 5 }) };
    const idb = new Map([['opa.p.' + a1.p.id, a1.raw], ['opa.index', JSON.stringify([entry(a1.p.id, 'A old', '2026-01-01')])]]);
    const out = mergeLegacy(idb, { ['opa.p.' + a1.p.id]: a2.raw, 'opa.index': JSON.stringify([entry(a1.p.id, 'A new', '2026-02-01')]) });
    expect(out.get('opa.p.' + a1.p.id)).toBe(a2.raw); expect(JSON.parse(out.get('opa.index')!)[0].name).toBe('A new');
    // and the other way round: IndexedDB newer wins
    const out2 = mergeLegacy(new Map([['opa.p.' + a1.p.id, a2.raw]]), { ['opa.p.' + a1.p.id]: a1.raw });
    expect(out2.has('opa.p.' + a1.p.id)).toBe(false);
  });
  it('a project with data but no list entry gets one (never invisible); list entries without data are dropped', () => {
    const a = proj('Orphan', 1);
    const out = mergeLegacy(new Map(), { ['opa.p.' + a.p.id]: a.raw, 'opa.index': JSON.stringify([entry('ghost', 'Ghost', '2026-01-01')]) });
    const idx = JSON.parse(out.get('opa.index')!); expect(idx.map((e: any) => e.id)).toEqual([a.p.id]); expect(idx[0].name).toBe('Orphan');
  });
  it('carries the v0.1 single-project key and a broken copy over untouched', () => {
    const a = proj('Legacy', 0);
    const out = mergeLegacy(new Map(), { 'opa.project.v1': a.raw, 'opa.project.v1.broken': '{bad' });
    expect(out.get('opa.project.v1')).toBe(a.raw); expect(out.get('opa.project.v1.broken')).toBe('{bad');
    // a different legacy copy already in IndexedDB is not overwritten: the new one is kept beside it
    const out2 = mergeLegacy(new Map([['opa.project.v1.broken', '{other']]), { 'opa.project.v1.broken': '{bad' });
    expect([...out2.values()]).toContain('{bad'); expect(out2.has('opa.project.v1.broken')).toBe(false);
  });
  it('a damaged localStorage project is copied as is (rescue download still works)', () => {
    const out = mergeLegacy(new Map(), { 'opa.p.x1': '{not json', 'opa.index': JSON.stringify([entry('x1', 'Hurt', '2026-01-01')]) });
    expect(out.get('opa.p.x1')).toBe('{not json'); expect(JSON.parse(out.get('opa.index')!)[0].name).toBe('Hurt');
  });
  it('nothing to write when localStorage is empty and IndexedDB is consistent', () => {
    const a = proj('A', 1); const idb = new Map([['opa.p.' + a.p.id, a.raw], ['opa.index', JSON.stringify([entry(a.p.id, 'A', '2026')])]]);
    expect(mergeLegacy(idb, {}).size).toBe(0);
  });
  it('only project keys are moved', () => { expect(['opa.index', 'opa.p.1', 'opa.project.v1'].every(isProjectKey)).toBe(true); expect(['opa.lang', 'opa.author', 'opa.homeTip'].some(isProjectKey)).toBe(false); });
});

describe('OUT2-10 iOS Safari hint', () => {
  const SAF = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  it('shows on iPhone Safari and iPad (desktop-class UA with touch)', () => {
    expect(isIosSafari(SAF, 5, false)).toBe(true);
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5, false)).toBe(true);
  });
  it('not on Chrome/Firefox/Edge for iOS, not installed, not desktop Mac, not Android', () => {
    expect(isIosSafari(SAF.replace('Version/18.0', 'CriOS/130.0'), 5, false)).toBe(false);
    expect(isIosSafari(SAF.replace('Version/18.0', 'FxiOS/130.0'), 5, false)).toBe(false);
    expect(isIosSafari(SAF.replace('Version/18.0', 'EdgiOS/130.0'), 5, false)).toBe(false);
    expect(isIosSafari(SAF, 5, true)).toBe(false);
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0, false)).toBe(false);
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', 5, false)).toBe(false);
  });
});
