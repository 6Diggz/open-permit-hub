// r3data-06: dragging the ADU must not write storage on every pointermove (save on drop only). Counts localStorage and IndexedDB writes (the opa.wal.* journal mirrors each IndexedDB write and is not counted twice).
import { createRequire } from 'module'; const require = createRequire('/home/claude/stress/e2e/lib.mjs');
const { chromium } = require('playwright'); const BASE = (process.env.BASE || 'http://localhost:4391/');
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); await pg.goto(BASE);
await pg.getByRole('button', { name: /Try the demo lot/i }).first().click(); await pg.locator('nav.rail').waitFor();
await pg.locator('nav.rail button.step').nth(1).click(); await pg.waitForTimeout(500);
const poly = pg.locator('svg polygon[role=button]').first(); await poly.scrollIntoViewIfNeeded(); const bb = await poly.boundingBox();
await pg.evaluate(() => { window.__sets = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (!String(k).startsWith('opa.wal.')) window.__sets++; return o.call(this, k, v); }; const q = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { window.__sets++; return q.apply(this, a); }; });
const x = bb.x + bb.width * .3, y = bb.y + bb.height * .3; await pg.mouse.move(x, y); await pg.mouse.down();
for (let i = 1; i <= 60; i++) await pg.mouse.move(x + i * 2, y + i); await pg.mouse.up(); await pg.waitForTimeout(800);
const sets = await pg.evaluate(() => window.__sets); await b.close();
console.log(sets <= 4 ? 'PASS' : 'FAIL', 'storage writes during one 60-move drag:', sets); process.exit(sets <= 4 ? 0 : 1);
