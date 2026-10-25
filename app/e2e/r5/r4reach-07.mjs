// r4reach-07: on a phone every export (not only the backup) goes to the share sheet when the phone can share files.
import { phone, demoExport } from '../r4/_ios.mjs';
const { b, pg } = await phone();
await pg.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: async d => { (window.__sh ||= []).push(d.files[0].name); }, configurable: true }); });
await pg.reload(); await pg.waitForTimeout(800); await demoExport(pg);
for (const n of [/screen readers/, /Materials list/, /for CAD/]) { await pg.getByRole('button', { name: n }).click(); await pg.waitForTimeout(1500); }
const sh = await pg.evaluate(() => window.__sh || []); await b.close();
if (sh.length < 3) { console.error('FAIL: shared only', sh); process.exit(1); }
console.log('PASS', sh);
