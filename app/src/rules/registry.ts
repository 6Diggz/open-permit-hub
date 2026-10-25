// r4juris-05: one place that picks the rule pack for a project's jurisdiction. Add a pack here (rules, sheet catalog,
// rule-to-sheet map, meta, parameters) and the rest of the app can find it. Only LA City has a pack today.
import { RULES, PARAMS } from './la-city';
import { CATALOG, RULE_ITEMS, type SheetItem } from './ladbs-adu-2025';
import { PACK, PACK_ID } from './pack';
import type { Rule } from './engine';

export interface Pack { id: string; meta: typeof PACK; rules: Rule[]; catalog: SheetItem[]; ruleItems: Record<string, string[]>; params: typeof PARAMS }
const PACKS: Record<string, Pack> = { 'la-city': { id: PACK_ID, meta: PACK, rules: RULES, catalog: CATALOG, ruleItems: RULE_ITEMS, params: PARAMS } };
/** The pack for a jurisdiction, or null when this app has none ("other", "unknown", or a place with no pack yet). */
export const packFor = (jurisdiction: string): Pack | null => (Object.prototype.hasOwnProperty.call(PACKS, jurisdiction) ? PACKS[jurisdiction] : null) ?? null; // r5gold-05
/** True when the report was made with this jurisdiction's own pack (a pack id is "<jurisdiction>@<version>"). */
export const packMatches = (jurisdiction: string, packId: string) => packId.startsWith(jurisdiction + '@');
