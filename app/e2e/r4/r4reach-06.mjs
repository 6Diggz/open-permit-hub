// iOS Safari asks "Download?" and reads the blob only after the tap. The app revokes the blob URL 2 s after click; FileSaver.js waits 40 s for this reason.
import { phone, demoExport } from './_ios.mjs';
const { b, pg } = await phone();
await pg.addInitScript(() => { const r = URL.revokeObjectURL.bind(URL); const t0 = new Map(); const c = URL.createObjectURL.bind(URL);
  URL.createObjectURL = o => { const u = c(o); t0.set(u, Date.now()); return u; }; URL.revokeObjectURL = u => { (window.__rv ||= []).push(Date.now() - (t0.get(u) ?? Date.now())); r(u); }; });
await pg.reload(); await pg.waitForTimeout(800); await demoExport(pg);
await pg.getByRole('button', { name: /Materials list/ }).click(); await pg.waitForTimeout(3500);
const rv = await pg.evaluate(() => window.__rv || []); await b.close();
if (rv.some(ms => ms < 30000)) { console.error('FAIL: blob URL revoked after', rv, 'ms'); process.exit(1); }
console.log('PASS', rv);
