import { createRequire } from 'module'; const require = createRequire('/home/claude/stress/e2e/lib.mjs');
export const { chromium } = require('playwright');
export const BASE = (process.env.BASE || 'http://127.0.0.1:4817/').replace(/\/?$/, '/');
export async function rooms(n = 2, w = 390) { const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: w, height: 844 }, hasTouch: w < 600 }); const page = await c.newPage(); page.setDefaultTimeout(8000);
  await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await page.evaluate(() => { location.hash = '#step=rooms'; }); await page.waitForTimeout(300);
  for (let i = 0; i < n; i++) await page.getByRole('button', { name: 'Add a room', exact: true }).click();
  return { b, page, rooms: page.locator('.drawing svg polygon[role=button]') }; }
export const done = async (b, ok, msg) => { await b.close(); console.log(ok ? 'PASS' : 'FAIL', msg); process.exit(ok ? 0 : 1); };
