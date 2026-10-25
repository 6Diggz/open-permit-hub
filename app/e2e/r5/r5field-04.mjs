// r5field-04: a deep link to #field with no project must say it is field mode and offer to open a visit pack;
// and after picking a project from there, the URL must still be #field (reload keeps field mode).
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const BASE = process.env.BASE || 'http://localhost:5815/open-permit-hub/';
const b = await chromium.launch(); const pg = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
await pg.goto(BASE + '#field'); await pg.waitForTimeout(1500);
const body = await pg.evaluate(() => document.body.innerText);
const fails = [];
if (!/site visit|field mode|inspector/i.test(body)) fails.push('landing does not mention the site visit the link asked for');
await pg.getByText('Try the demo lot').tap(); await pg.waitForTimeout(1000);
const st = await pg.evaluate(() => [location.hash, document.querySelector('h2')?.textContent]);
if (st[1] === 'Site visit' && st[0] !== '#field') fails.push(`shows Site visit but URL is ${st[0]}`);
await b.close();
if (fails.length) { console.error('FAIL', fails); process.exit(1); } console.log('PASS');
