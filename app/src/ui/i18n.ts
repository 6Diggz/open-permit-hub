import { L, uiLang } from './lang';
/** Content language: rule results, citations and reports exist in English and Spanish (see lang.ts for UI languages). */
export type Lang = 'en' | 'es';
// English source text for a few shared labels; Spanish and other languages come through L() (es.ts, locales/*.json).
const D = {
  app: 'Garage to ADU check',
  tagline: 'Check an LA garage conversion against the rules before you pay for drawings.',
  steps: ['Lot', 'Garage', 'Rooms', 'Checks', 'Export', 'Review'],
  demo: 'Try the demo lot', start: 'Start my project',
  undo: 'Undo', redo: 'Redo',
  yes: 'Yes', no: 'No', unknown: "Don't know",
  next: 'Next', back: 'Back',
  saved: 'Saved on this device',
} as const;
export type Key = keyof typeof D;
/** The label in the current UI language. The lang argument is kept for old call sites; the UI language decides. */
export const tr = (_lang: string, k: Key): any => { void _lang; void uiLang; const v = D[k]; return Array.isArray(v) ? v.map(x => L(x)) : L(v as string); };
export const SHARED_EN: string[] = Object.values(D).flat();
