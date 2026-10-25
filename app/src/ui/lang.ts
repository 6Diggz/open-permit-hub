import type { Lang } from './i18n';
import { ES } from './es';
/**
 * Data-driven UI languages (OUT2-17). English is the source text and the key. Spanish (es.ts) is built in and reviewed.
 * Every other language is ONE file: src/ui/locales/<BCP-47 code>.json, found by the glob below and loaded only when picked.
 * The file holds "_meta" (beta flag, text direction, PDF script) and English -> translation pairs. See docs/TRANSLATING.md.
 */
export interface LocaleMeta { beta: boolean; dir: 'ltr' | 'rtl'; reviewedBy?: string; note?: string }
export type Locale = { _meta: LocaleMeta } & Record<string, string | LocaleMeta>;
const FILES = import.meta.glob<Locale>('./locales/*.json', { import: 'default' });
const code = (path: string) => path.replace(/^.*\/|\.json$/g, '');
/** Every UI language: English, Spanish, then each locale file (sorted by code). */
export const UI_LANGS: string[] = ['en', 'es', ...Object.keys(FILES).map(code).sort()];
const loaded: Record<string, Locale> = {};
/** Load a locale file (no-op for en/es or when already loaded). Resolves false for an unknown code. */
export async function loadLang(c: string): Promise<boolean> {
  if (c === 'en' || c === 'es' || loaded[c]) return true;
  const f = Object.entries(FILES).find(([p]) => code(p) === c)?.[1]; if (!f) return false;
  loaded[c] = await f(); return true;
}
export const localeMeta = (c: string): LocaleMeta | null => (c === 'en' || c === 'es' ? null : loaded[c]?._meta ?? null);
export const langDir = (c: string): 'ltr' | 'rtl' => localeMeta(c)?.dir ?? 'ltr';
/** The language's own name for itself (Intl), e.g. 한국어, فارسی. */
export function nativeName(c: string): string {
  try { const n = new Intl.DisplayNames([c], { type: 'language' }).of(c); if (n && n !== c) return n.charAt(0).toLocaleUpperCase(c) + n.slice(1); } catch { /* old browser */ }
  return c;
}
/** Pick a supported UI language from the browser's list (exact code, then base language). */
export function pickLang(prefs: readonly string[]): string {
  for (const p of prefs) { const hit = UI_LANGS.find(c => c.toLowerCase() === p.toLowerCase()); if (hit) return hit; }
  for (const p of prefs) { const b = p.toLowerCase().split('-')[0]; const hit = UI_LANGS.find(c => c.toLowerCase().split('-')[0] === b && (b !== 'zh' || /hant|tw|hk|mo/i.test(p) === /hant/i.test(c))); if (hit) return hit; }
  return 'en';
}

/** Current UI language, set once per render by App. Shared by every screen so strings never mix languages. */
let LANG = 'en';
export const setUiLang = (l: string) => { LANG = l; };
export const uiLang = () => LANG;
/** Content language for rule results and code citations, which exist in English and Spanish only. */
export const contentLang = (l: string = LANG): Lang => (l === 'es' ? 'es' : 'en');
/** English text -> the UI language (missing entries fall back to English; a test lists them). */
export const L = (en: string): string => {
  if (LANG === 'en') return en;
  if (LANG === 'es') return (ES as Record<string, string>)[en] ?? en;
  const t = loaded[LANG]?.[en]; return typeof t === 'string' && t ? t : en;
};
