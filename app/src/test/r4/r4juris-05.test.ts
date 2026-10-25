// r4juris-05: no pack registry. UI, readiness, PDF and HTML import la-city RULES / LADBS CATALOG directly; nothing picks a pack by jurisdiction.
import { it, expect } from 'vitest';
it('r4juris-05 rules/registry.ts selects a pack (rules, catalog, meta, freshness) from the project', async () => {
  const mod = await import('../../rules/registry').catch(() => null) as null | { packFor: (j: string) => { id: string; rules: unknown[]; catalog: unknown[]; ruleItems: Record<string, string[]> } | null };
  expect(mod, 'rules/registry.ts with packFor()').not.toBeNull();
  const la = mod!.packFor('la-city'); expect(la?.id).toMatch(/^la-city@/); expect(la!.rules.length).toBeGreaterThan(10); expect(la!.catalog.length).toBeGreaterThan(10);
  expect(mod!.packFor('other')).toBeNull();
});
