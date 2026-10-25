// r3data-05: restoring the same backup twice on one device must not create an "(opened copy)" of every project.
import { createRequire } from 'module'; const require = createRequire('/home/claude/stress/e2e/lib.mjs');
const { chromium } = require('playwright'); const BASE = (process.env.BASE || 'http://localhost:4391/');
const b = await chromium.launch(); const pg = await (await b.newContext()).newPage(); await pg.goto(BASE);
const f = '/home/claude/stress/r3/tests/fixtures/r3data-b50.permitpack', inp = pg.locator('input[type=file][accept^=".permitpack"]');
await inp.setInputFiles(f); await pg.waitForTimeout(2500); await inp.setInputFiles(f); await pg.waitForTimeout(4000);
const n = await pg.evaluate(() => new Promise(res => { const r = indexedDB.open('opa-store', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('opa.index'); q.onsuccess = () => res(JSON.parse(q.result || '[]').length); }; })); await b.close();
console.log(n === 50 ? 'PASS' : 'FAIL', 'projects after restoring the same 50-project backup twice:', n); process.exit(n === 50 ? 0 : 1);
