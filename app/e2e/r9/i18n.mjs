// OUT2-17 / r4reach-11 / qa-16: pick each beta language; the UI changes, the beta note shows, Farsi turns the page RTL while the
// site plan stays left to right; parity2-09 groups the sheet questions. Run: BASE=http://127.0.0.1:PORT/ node e2e/r9/i18n.mjs [shotsDir]
import { chromium, BASE } from '../r4/_ui.mjs';
const shots = process.argv[2]; let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
const b = await chromium.launch();
for (const w of [390, 1440]) {
  const c = await b.newContext({ viewport: { width: w, height: 844 }, hasTouch: w < 600 }); const page = await c.newPage(); page.setDefaultTimeout(8000);
  await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click();
  await page.evaluate(() => { location.hash = '#step=checks'; }); await page.waitForTimeout(300);
  ok(await page.getByRole('heading', { name: /Questions for you/ }).isVisible(), `parity2-09 homeowner group shown ${w}`);
  ok(!(await page.locator('details:has(summary:text("Plan-sheet items for your preparer"))').getAttribute('open')), `parity2-09 preparer group closed by default ${w}`);
  await page.locator('summary', { hasText: 'Plan-sheet items for your preparer' }).click(); ok(await page.getByText(/Filled in from/).first().isVisible(), `parity2-09 a default shows its source ${w}`);
  if (shots) await page.getByText(/Filled in from/).first().screenshot({ path: `${shots}/r9-parity2-09-default-${w}.png` }).catch(() => {});
  for (const [code, word] of [['ko', '검토'], ['zh-Hans', '检查'], ['zh-Hant', '檢查'], ['hy', 'Ստուգումներ'], ['tl', 'Mga tseke'], ['fa', 'بررسی']]) {
    await page.locator('#lang').selectOption(code); await page.waitForTimeout(250);
    ok(await page.getByTestId('beta-translation').isVisible(), `${code}: beta note ${w}`);
    ok((await page.locator('main').innerText()).includes(word), `${code}: UI translated ${w}`);
    const dir = await page.evaluate(() => document.documentElement.dir); ok(dir === (code === 'fa' ? 'rtl' : 'ltr'), `${code}: dir=${dir} ${w}`);
    if (code === 'fa') { const d = await page.evaluate(() => getComputedStyle(document.querySelector('.drawing svg')).direction); ok(d === 'ltr', `fa: drawing stays ltr ${w}`);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); ok(sw, `fa: no sideways scroll ${w}`); }
    if (shots && (code === 'fa' || code === 'ko')) await page.screenshot({ path: `${shots}/r9-i18n-${code}-${w}.png`, fullPage: false });
  }
  await page.locator('#lang').selectOption('en'); ok(await page.evaluate(() => document.documentElement.dir) === 'ltr' && !(await page.getByTestId('beta-translation').count()), `back to English ${w}`);
  await page.reload(); await page.locator('#lang').selectOption('ko'); await page.reload(); await page.waitForTimeout(400);
  ok((await page.locator('#lang').inputValue()) === 'ko' && (await page.locator('main').innerText()).includes('검토'), `ko kept after reload ${w}`);
  await page.locator('#lang').selectOption('en'); await c.close();
}
await b.close(); process.exit(bad ? 1 : 0);
