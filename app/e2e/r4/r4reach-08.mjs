// iOS maps <input accept> extensions to UTIs; ".permitpack" has none, so the Files picker can grey out the user's own backup.
// Pass when the restore input accepts a generic type (or no accept filter) so any file can be picked and validated in code.
import { phone } from './_ios.mjs';
const { b, pg } = await phone();
const acc = await pg.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(i => i.getAttribute('accept'))); await b.close();
const ok = acc.every(a => !a || /application\/octet-stream|\*\/\*/.test(a));
if (!ok) { console.error('FAIL: accept=', acc); process.exit(1); } console.log('PASS', acc);
