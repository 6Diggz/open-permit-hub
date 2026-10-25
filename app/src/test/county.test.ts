// OUT-15 / r4juris-07: County pack seam. Pack-declared inputs survive save/open, routing goes through the registry,
// and the UI and verdict load rules through packFor() instead of importing LA City directly.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { demoProject, blankCounty } from '../core/model';
import { migrate, serialize } from '../core/permitpack';
import { packForProject } from '../rules/registry';
import { getVerdict } from '../core/verdict';
import { exportBlockers } from '../rules/engine';

it('r4juris-07: County-only answers (LACoFD Form 196 fire flow, hydrant, access) round-trip and bad values reset', () => {
  const p = demoProject(); p.site.jurisdiction = 'la-county';
  p.site.county = { ...blankCounty(), betaOptIn: true, fireFlowGpm: 1250, hydrantFt: 300, roadGradeOk: 'yes' };
  const back = migrate(JSON.parse(serialize(p)));
  expect(back.site.county).toMatchObject({ betaOptIn: true, fireFlowGpm: 1250, hydrantFt: 300, roadGradeOk: 'yes', pathGradeOk: 'unknown' });
  const bad = migrate({ ...JSON.parse(serialize(p)), site: { ...JSON.parse(serialize(p)).site, county: { betaOptIn: 'yes', fireFlowGpm: -5, roadGradeOk: 'maybe' } } });
  expect(bad.site.county).toMatchObject({ betaOptIn: false, fireFlowGpm: null, roadGradeOk: 'unknown' });
});

it('OUT-15: routing by jurisdiction plus opt-in; the verdict uses the County pack', () => {
  const p = demoProject(); expect(packForProject(p).id).toMatch(/^la-city@/);
  p.site.jurisdiction = 'la-county'; expect(packForProject(p).id).toMatch(/^la-city@/);
  p.site.county = { ...blankCounty(), betaOptIn: true }; expect(packForProject(p).id).toMatch(/^la-county@/);
  const v = getVerdict(p); expect(v.report.pack).toMatch(/^la-county@/); expect(v.plain.verdict).not.toBe('likely-yes');
  expect(exportBlockers(p, v.report).some(b => /beta/i.test(b))).toBe(true);
});

it('OUT-15: App and verdict pick rules through the registry, not by evaluating LA City RULES directly', () => {
  for (const f of ['../ui/App.tsx', '../core/verdict.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    expect(src, f).toMatch(/packForProject/);
    expect(src.replace(/evaluate\(demoProject\(\), RULES, PACK_ID\)/, ''), f).not.toMatch(/evaluate\([^)]*\bRULES\b/);
  }
});
