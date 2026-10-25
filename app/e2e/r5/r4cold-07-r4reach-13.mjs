// r4cold-07: the landing example hides its citations behind "Sources" and says "LA rules as of".
// r4reach-13: Safari on iPhone (not Home Screen) gets a one-time Add to Home Screen tip.
import { phone } from '../r4/_ios.mjs';
const { b, pg } = await phone(); const bad = [];
const home = await pg.locator('.sample').innerText();
if (/rule pack la-city@/.test(home)) bad.push('landing example still shows the rule pack id');
if (!/LA rules as of/.test(home)) bad.push('no "LA rules as of" line');
if (!(await pg.locator('.sample details summary').count())) bad.push('citations not behind Sources');
await pg.getByText('Try the demo lot').click(); await pg.waitForTimeout(800);
if (!/Add to Home Screen/.test(await pg.locator('body').innerText())) bad.push('no Home Screen tip on iPhone Safari');
await pg.getByRole('button', { name: 'OK' }).first().click(); await pg.reload(); await pg.waitForTimeout(800);
if (/Add to Home Screen/.test(await pg.locator('body').innerText())) bad.push('tip shows again after OK');
await b.close(); if (bad.length) { console.error('FAIL', bad); process.exit(1); } console.log('PASS');
