// r4juris-05 / OUT-15: one place that picks the rule pack for a project's jurisdiction. Add a pack here (rules, sheet catalog,
// rule-to-sheet map, meta, parameters) and the rest of the app finds it through packFor().
import type { Project } from '../core/model';
import { RULES, PARAMS } from './la-city';
import { CATALOG, RULE_ITEMS, type SheetItem } from './ladbs-adu-2025';
import { PACK, PACK_ID } from './pack';
import { COUNTY_RULES, COUNTY_PARAMS } from './la-county';
import { COUNTY_PACK, COUNTY_PACK_ID, COUNTY_CATALOG, COUNTY_RULE_ITEMS } from './county-pack';
import type { Rule } from './engine';

export interface PackMeta { jurisdiction: string; version: string; effectiveFrom: string; verifiedOn: string; reviewBy: string; beta?: boolean;
  sheet: { form: string; rev: string; url: string; codes: string; name?: { en: string; es: string } } }
export interface Pack { id: string; meta: PackMeta; rules: Rule[]; catalog: SheetItem[]; ruleItems: Record<string, string[]>; params: Record<string, unknown>;
  /** Beta packs are opt-in, never say "Likely yes" and cannot export. */ beta: boolean }

export const CITY: Pack = { id: PACK_ID, meta: PACK, rules: RULES, catalog: CATALOG, ruleItems: RULE_ITEMS, params: PARAMS, beta: false };
export const COUNTY: Pack = { id: COUNTY_PACK_ID, meta: COUNTY_PACK, rules: COUNTY_RULES, catalog: COUNTY_CATALOG, ruleItems: COUNTY_RULE_ITEMS, params: COUNTY_PARAMS, beta: true };
const PACKS: Record<string, Pack> = { 'la-city': CITY, 'la-county': COUNTY };
const BETA = new Set(['la-county']);

/** The pack for a jurisdiction, or null when this app has none. Beta packs need opts.beta (the user's opt-in). */
export const packFor = (jurisdiction: string, opts: { beta?: boolean } = {}): Pack | null =>
  (Object.prototype.hasOwnProperty.call(PACKS, jurisdiction) && (!BETA.has(jurisdiction) || opts.beta === true) ? PACKS[jurisdiction] : null) ?? null; // r5gold-05

/** The pack that checks this project. Without one, LA City rules run so the lot gets an honest "not supported". */
export const packForProject = (p: Project): Pack => packFor(p.site.jurisdiction, { beta: p.site.county?.betaOptIn === true }) ?? CITY;

/** The pack a report was made with, from its pack id ("<jurisdiction>@<version>"). */
export const packById = (id: string): Pack => Object.values(PACKS).find(k => k.id === id) ?? Object.values(PACKS).find(k => id.startsWith(k.meta.jurisdiction + '@')) ?? CITY;

/** True when the report was made with this jurisdiction's own pack (a pack id is "<jurisdiction>@<version>"). */
export const packMatches = (jurisdiction: string, packId: string) => packId.startsWith(jurisdiction + '@');
