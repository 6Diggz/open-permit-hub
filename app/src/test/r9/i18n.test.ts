// OUT2-17 / r4reach-11 / qa-16: data-driven UI languages. Every locale file has every key, says it is a beta,
// declares its text direction, and every safety-critical string is listed for human review.
import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ES } from '../../ui/es';
import { SHARED_EN } from '../../ui/i18n';
import { UI_LANGS, loadLang, setUiLang, L, langDir, localeMeta, pickLang, contentLang } from '../../ui/lang';
const dir = new URL('../../ui/locales/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json'));
const KEYS = [...new Set([...Object.keys(ES), ...SHARED_EN])];
export const SAFETY = /fire|egress|escape|alarm|smoke|sprinkler|\bCO\b|burn area|hazard|engineer|structural|hose|methane|rated|Safety|safety/;

it('qa-16 the LA City Tier 1 languages are present, each found from its file alone', () => {
  for (const c of ['ko', 'zh-Hans', 'zh-Hant', 'hy', 'tl', 'fa']) expect(UI_LANGS, c).toContain(c);
  expect(UI_LANGS.length).toBe(2 + files.length);
});
it('OUT2-17 every language has every key, none empty, and nothing extra', () => {
  expect(KEYS.length).toBeGreaterThan(500);
  for (const f of files) { const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const missing = KEYS.filter(k => typeof j[k] !== 'string' || !j[k].trim()); expect(missing, f).toEqual([]);
    const extra = Object.keys(j).filter(k => k !== '_meta' && !KEYS.includes(k)); expect(extra, f).toEqual([]);
    expect(j._meta.beta, f).toBe(true); expect(['ltr', 'rtl']).toContain(j._meta.dir); }
  for (const k of SHARED_EN) expect(k in ES, k).toBe(true);
});
it('r4reach-11 Farsi is right-to-left; others left-to-right', async () => {
  for (const c of UI_LANGS) await loadLang(c);
  expect(langDir('fa')).toBe('rtl'); expect(langDir('ko')).toBe('ltr'); expect(langDir('en')).toBe('ltr');
  expect(localeMeta('fa')?.beta).toBe(true); expect(localeMeta('es')).toBeNull();
});
it('L() uses the loaded language, falls back to English, and rule content stays en/es', async () => {
  await loadLang('ko'); setUiLang('ko'); expect(L('Add a room')).toBe('방 추가'); expect(L('not a key at all')).toBe('not a key at all');
  expect(contentLang()).toBe('en'); setUiLang('es'); expect(L('Add a room')).toBe('Agregar un cuarto'); expect(contentLang()).toBe('es'); setUiLang('en');
});
it('browser language picks the right UI language (Traditional vs Simplified Chinese)', () => {
  expect(pickLang(['zh-TW'])).toBe('zh-Hant'); expect(pickLang(['zh-CN'])).toBe('zh-Hans'); expect(pickLang(['ko-KR'])).toBe('ko');
  expect(pickLang(['fil-PH', 'tl'])).toBe('tl'); expect(pickLang(['fr-FR'])).toBe('en'); expect(pickLang(['es-MX'])).toBe('es');
});
it('machine-translation risk: every safety-critical string is listed in docs/TRANSLATION_REVIEW.md as NEEDS_PEOPLE', () => {
  const doc = readFileSync(new URL('../../../../docs/TRANSLATION_REVIEW.md', import.meta.url), 'utf8');
  const crit = KEYS.filter(k => SAFETY.test(k)); expect(crit.length).toBeGreaterThan(30);
  const missing = crit.filter(k => !doc.includes(JSON.stringify(k))); expect(missing).toEqual([]);
  expect(doc).toMatch(/NEEDS_PEOPLE/);
});
import { buildServiceWorker } from '../../../sw-build';
it('OUT2-17 the lazy CJK font pieces are not in the offline precache; the language files are', () => {
  const sw = buildServiceWorker(['index.html', 'assets/noto-sans-kr-12-400-normal-AbCd1234.js', 'assets/ko-AbCd1234.js'], '<html>');
  expect(sw.precache).toContain('./assets/ko-AbCd1234.js'); expect(sw.precache.some(f => f.includes('noto-sans-kr'))).toBe(false);
});
it('r4reach-11 RTL CSS keeps the drawings unmirrored', () => {
  const css = readFileSync(new URL('../../ui/styles.css', import.meta.url), 'utf8'); expect(css).toMatch(/\[dir="rtl"\] \.drawing, \[dir="rtl"\] \.drawing svg \{ direction: ltr; \}/);
});
