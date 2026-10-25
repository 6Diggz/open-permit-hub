import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
export const { webkit, devices } = require('playwright');
export async function phone(w = 375, h = 667) {
  const b = await webkit.launch(); const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, userAgent: devices['iPhone SE'].userAgent, acceptDownloads: true });
  const pg = await ctx.newPage(); await pg.goto(process.env.BASE); await pg.waitForTimeout(800); return { b, pg };
}
export async function demoExport(pg) { await pg.getByText('Try the demo lot').click(); await pg.waitForTimeout(500); await pg.locator('.rail >> text=Export').click(); await pg.waitForTimeout(500); }
