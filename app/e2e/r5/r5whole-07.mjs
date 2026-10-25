// r5whole-07: a bookmarked or shared #field link silently lands on the welcome page: no project chooser, no word about field mode.
// The inspector has no way in except project -> step 6 Review -> scroll -> Open field mode.
// Run: BASE=http://localhost:PORT/ node r5whole-07.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../../package.json', import.meta.url))('playwright');
const b = await chromium.launch(); const bad = [];
{ const pg = await b.newPage({ viewport: { width: 390, height: 844 } }); await pg.goto(process.env.BASE + '#field'); await pg.waitForTimeout(1200);
  if (!/site visit|field mode/i.test(await pg.locator('body').innerText())) bad.push('#field with no project: welcome page says nothing about the site visit'); await pg.close(); }
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); await pg.goto(process.env.BASE);
  await pg.click('text=Start my project'); await pg.waitForTimeout(800); await pg.click('button:has-text("All projects")').catch(() => {});
  await pg.goto(process.env.BASE + '#field'); await pg.reload(); await pg.waitForTimeout(1200);
  if (!/Site visit/.test(await pg.locator('body').innerText())) bad.push('#field with a saved project: field mode does not open'); await ctx.close(); }
await b.close(); if (bad.length) { console.error('FAIL', bad); process.exit(1); } console.log('PASS');
