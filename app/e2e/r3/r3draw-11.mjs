// Keyboard only: a review note can be placed / moved to a chosen spot without tapping the plan.
import { chromium, BASE, done } from './_ui.mjs';
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); page.setDefaultTimeout(8000);
await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await page.evaluate(() => { location.hash = '#step=review'; }); await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Add a note at the ADU' }).click();
await page.getByRole('button', { name: 'Move this note' }).click();
const pin = page.locator('svg g[role=button], svg [aria-label*="ote"]').first();
const before = await page.locator('svg circle').evaluateAll(cs => cs.map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join(';'));
for (const k of ['ArrowRight', 'ArrowRight', 'Enter']) await page.keyboard.press(k);
const after = await page.locator('svg circle').evaluateAll(cs => cs.map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join(';'));
await done(b, before !== after, 'keyboard moved the note: ' + (before !== after));
