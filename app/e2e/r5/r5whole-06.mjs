// r5whole-06: on a phone the plain answer ("Can my garage become an ADU?") and the check card sit ~4,300 px down,
// below the whole Lot form (page 10,600 px tall). Fails if the plain answer is not within the first 2 screens of step 1.
// Run: BASE=http://localhost:PORT/ node r5whole-06.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.goto(process.env.BASE); await pg.click('text=Try the demo lot'); await pg.waitForTimeout(1200);
const y = await pg.getByText(/can become an ADU|Not sure:|Maybe this garage/).first().evaluate(e => e.getBoundingClientRect().top + scrollY);
await b.close();
if (y > 844 * 2) { console.error(`FAIL plain answer at ${Math.round(y)}px on a 844px phone screen`); process.exit(1); } console.log('PASS', y);
