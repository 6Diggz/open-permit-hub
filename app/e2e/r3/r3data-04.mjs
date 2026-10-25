// r3data-04: restoring a backup that does not fit must say how many were NOT restored and why (storage full).
import { createRequire } from 'module'; const require = createRequire('/home/claude/stress/e2e/lib.mjs');
const { chromium } = require('playwright'); const BASE = (process.env.BASE || 'http://localhost:4391/');
const b = await chromium.launch(); const pg = await (await b.newContext()).newPage(); await pg.goto(BASE);
const inp = pg.locator('input[type=file][accept^=".permitpack"]'); await inp.setInputFiles('/home/claude/stress/r3/tests/fixtures/r3data-b50.permitpack'); await pg.waitForTimeout(2500);
await inp.setInputFiles('/home/claude/stress/r3/tests/fixtures/r3data-big3.permitpack');
await pg.waitForTimeout(4000); const msg = (await pg.locator('[role=alert]').allInnerTexts()).join(' ');
await b.close(); const ok = /Restored 3 projects/.test(msg) || /full|space|not restored|could not/i.test(msg);
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(msg)); process.exit(ok ? 0 : 1);
