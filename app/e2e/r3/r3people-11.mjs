// Field inspector on a 390px phone: after "Place a pin on the plan" the plan must be on screen.
// BASE=http://localhost:4794/ node r3people-11.mjs
import { createRequire } from 'module'; const require = createRequire('/home/claude/stress/e2e/package.json');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'https://6diggz.github.io/open-permit-hub/';
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await pg.goto(BASE); await pg.getByRole('button', { name: /^Start my project/ }).click(); await pg.locator('nav.rail').waitFor();
await pg.locator('nav.rail button.step').nth(5).click(); await pg.waitForTimeout(300);
await pg.getByRole('button', { name: /Place a pin/ }).click(); await pg.waitForTimeout(600);
const bb = await pg.locator('svg').first().boundingBox();
await b.close();
const visible = bb && bb.y + bb.height * 0.5 > 0 && bb.y < 844;
if (!visible) { console.error('FAIL plan is off screen while the app says "Tap the plan":', JSON.stringify(bb)); process.exit(1); } console.log('PASS');
