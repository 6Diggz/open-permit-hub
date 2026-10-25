// BASE=http://localhost:4793/ node r3people-02.mjs  -> exit 1 on fail
import { createRequire } from 'module'; const require = createRequire('/home/claude/stress/e2e/package.json');
const { chromium } = require('playwright');
const BASE = (process.env.BASE || 'https://6diggz.github.io/open-permit-hub/');
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, locale: 'es-MX' })).newPage();
await pg.goto(BASE); await pg.getByRole('button', { name: /^Empezar/ }).click(); await pg.locator('nav.rail').waitFor();
const bad = [];
for (let i = 0; i < 6; i++) { await pg.locator('nav.rail button.step').nth(i).click(); await pg.waitForTimeout(300);
  const o = await pg.evaluate(() => [...(document.documentElement.scrollWidth > 360 ? ['DOC scrollWidth=' + document.documentElement.scrollWidth] : []), ...[...document.querySelectorAll('body *')].filter(e => !e.closest('nav.rail') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > 360.5).map(e => e.tagName + ':' + (e.textContent || '').slice(0, 30))]);
  if (o.length) bad.push({ step: i, o: o.slice(0, 3) }); }
await b.close();
if (bad.length) { console.error('FAIL content wider than 360px phone:', JSON.stringify(bad)); process.exit(1); } console.log('PASS');
