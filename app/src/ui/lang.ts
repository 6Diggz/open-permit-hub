import type { Lang } from './i18n';
import { ES } from './es';
/** Current UI language, set once per render by App. Shared by every screen so strings never mix languages. */
let LANG: Lang = 'en';
export const setUiLang = (l: Lang) => { LANG = l; };
export const uiLang = () => LANG;
/** English text -> Spanish when the UI is in Spanish (missing entries fall back to English; a test lists them). */
export const L = (en: string) => (LANG === 'es' ? (ES as Record<string, string>)[en] ?? en : en);
