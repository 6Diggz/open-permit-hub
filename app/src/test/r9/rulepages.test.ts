// OUT2-08: rule pages carry a plain explanation, real pass/fail examples with numbers, FAQ JSON-LD, canonical, hreflang and a checked date.
import { describe, it, expect } from 'vitest';
import { rulePages } from '../../../rule-pages';
import { RULES } from '../../rules/la-city';
import { PACK } from '../../rules/pack';
import { ruleExamples } from '../../rules/examples';

const pages = rulePages(); const ex = ruleExamples();
const ld = (h: string) => JSON.parse(h.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
describe('OUT2-08 rule pages', () => {
  for (const lang of ['en', 'es'] as const) for (const r of RULES) {
    const h = pages[`${lang === 'es' ? 'rules/es/' : 'rules/'}${r.id}.html`];
    it(`${lang} ${r.id}: explanation, FAQ JSON-LD, canonical, hreflang, checked date`, () => {
      expect(h).toContain(lang === 'es' ? '<h2>Qué revisa</h2>' : '<h2>What this checks</h2>');
      const j = ld(h); expect(j['@type']).toBe('FAQPage'); expect(j.mainEntity.length).toBeGreaterThanOrEqual(2);
      for (const q of j.mainEntity) { expect(q['@type']).toBe('Question'); expect(q.acceptedAnswer.text.length).toBeGreaterThan(10); }
      expect(h).toMatch(/<link rel="canonical" href="https:\/\/6diggz\.github\.io\/open-permit-hub\/rules\//);
      for (const hl of ['en', 'es', 'x-default']) expect(h).toContain(`hreflang="${hl}"`);
      expect(h).toContain(`<time datetime="${PACK.verifiedOn}">`);
      // Examples are the rule's own output: the message printed is the engine's message, numbers included.
      const e = ex[r.id]; if (e.pass) expect(h).toContain(e.pass.result.msg[lang].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
      if (e.fail) expect(h).toContain(lang === 'es' ? 'Un ejemplo que no cumple' : 'An example that fails');
    });
  }
  it('most rules have a real worked example, and the key safety rules have both a pass and a fail with numbers', () => {
    const withAny = RULES.filter(r => ex[r.id].pass || ex[r.id].fail || ex[r.id].info).length; expect(withAny / RULES.length).toBeGreaterThan(0.9);
    for (const id of ['CEI-01', 'EGR-01', 'SPK-01', 'HGT-01', 'VAP-01']) { expect(ex[id].pass, id).toBeTruthy(); expect(ex[id].fail, id).toBeTruthy(); }
    expect(ex['CEI-01'].fail!.result.msg.en).toMatch(/6' 6"/); expect(ex['HGT-01'].fail!.result.msg.en).toMatch(/20' 0"/);
  });
  it('JSON-LD cannot break out of its script tag', () => { for (const h of Object.values(pages)) { const m = h.match(/<script type="application\/ld\+json">(.*?)<\/script>/s); if (m) expect(m[1]).not.toContain('<'); } });
});
