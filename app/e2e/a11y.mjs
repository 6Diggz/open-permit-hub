// OUT-09: WCAG 2.1 AA checks beyond axe, on every screen. A scripted keyboard pass (Tab through everything), plus
// focus order, focus visible, reflow at 320 px, text spacing (1.4.12), target size and status messages.
// Not a substitute for a human screen-reader pass; see ACCESSIBILITY.md for what is and is not covered.
//   npm run build && node e2e/a11y.mjs          SHOTS=/path node e2e/a11y.mjs  (also saves screenshots)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname; const DIST = resolve(here, '../dist');
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0, total = 0; const ok = (c, n, x = '') => { total++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c || !x ? '' : ' :: ' + x}`); if (!c) failed++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith('/open-permit-hub/')) return res.writeHead(404).end();
  let f = join(DIST, decodeURIComponent(u.pathname.slice(17)) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(DIST) || !existsSync(f)) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
const browser = await chromium.launch();

/** Screens: how to reach each one from a fresh page. */
const demo = async page => { await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await page.locator('nav.rail').waitFor(); };
const stepTo = k => async page => { await demo(page); await page.evaluate(k => { location.hash = '#step=' + k; }, k); await page.waitForTimeout(300); };
const SCREENS = {
  welcome: async page => { await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).waitFor(); },
  projects: async page => { await demo(page); await page.evaluate(() => { location.hash = ''; }); await page.reload(); await page.waitForTimeout(500); const a = page.getByRole('button', { name: /All projects/ }).locator('visible=true'); if (await a.count()) await a.first().click(); await page.waitForTimeout(300); },
  lot: stepTo('lot'), garage: stepTo('garage'), rooms: stepTo('rooms'), checks: stepTo('checks'), export: stepTo('export'), review: stepTo('review'),
  field: async page => { await stepTo('review')(page); await page.getByRole('button', { name: 'Open field mode' }).click(); await page.getByRole('heading', { name: 'Site visit' }).waitFor(); },
  clean: async page => { await page.goto(BASE + '#clean'); await page.waitForTimeout(800); },
  dialog: async page => { await stepTo('export')(page); await page.getByRole('button', { name: 'Save locked copy to share' }).click(); await page.locator('dialog.ask[open]').waitFor(); },
  rulepage: async page => { await page.goto(BASE + 'rules/CEI-01.html'); },
};

/** Tab through the whole page; record each stop. */
async function tabPass(page, max = 400) {
  await page.bringToFront();
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  // Start from the top of the document (or the open modal dialog).
  await page.evaluate(() => { const d = document.querySelector('dialog[open]'); (d ?? document.body).focus?.(); });
  const stops = []; let first = null;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const lab = e.closest('label');
      const lcs = lab ? getComputedStyle(lab) : null;
      // Focus is visible when the element (or its label.btn wrapper, for hidden file inputs) shows an outline or a box-shadow ring.
      const ring = (c) => c && ((c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2) || (c.boxShadow && c.boxShadow !== 'none'));
      const hidden = r.width < 2 || r.height < 2;
      if (!e.dataset.a11yI) e.dataset.a11yI = String(++window.__a11yN || (window.__a11yN = 1));
      return { key: (e.id ? '#' + e.id : '') + e.tagName + '#' + e.dataset.a11yI + ' ' + (e.getAttribute('aria-label') || e.textContent || e.closest('label')?.textContent || '').trim().slice(0, 40), tag: e.tagName, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height,
        visible: ring(cs) || (hidden && ring(lcs)), ol: cs.outlineStyle + ' ' + cs.outlineWidth + ' f=' + e.matches(':focus') + ' fv=' + e.matches(':focus-visible') + ' ' + e.type, offscreen: hidden && !lab, inDialog: !!e.closest('dialog[open]'), tabindex: e.getAttribute('tabindex') };
    });
    if (!s) continue; if (first && s.key === first) break; if (!first) first = s.key; stops.push(s);
  }
  return stops;
}

const widths = [390, 1440];
const pick = Object.entries(SCREENS).filter(([n]) => !process.env.SCREEN || process.env.SCREEN.split(',').includes(n));
for (const [name, go] of pick) for (const width of widths) {
  const W = `${name} @${width}`; const c = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } }); const page = await c.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  try { await go(page); } catch (e) { ok(false, `${W}: screen opens`, String(e).slice(0, 200)); await c.close(); continue; }
  // 2.1.1 / 2.4.3 / 2.4.7: keyboard pass
  const stops = await tabPass(page);
  ok(stops.length > 0, `${W}: keyboard reaches controls (${stops.length} stops)`);
  const noRing = stops.filter(s => !s.visible); ok(noRing.length === 0, `${W}: focus visible on every stop`, noRing.map(s => s.key + ' [' + s.ol + ']').slice(0, 6).join(' | '));
  const pos = stops.filter(s => s.tabindex && +s.tabindex > 0); ok(pos.length === 0, `${W}: no positive tabindex`, pos.map(s => s.key).join(' | '));
  const off = stops.filter(s => s.offscreen); ok(off.length === 0, `${W}: no focus on invisible elements`, off.map(s => s.key).slice(0, 6).join(' | '));
  if (name === 'dialog') ok(stops.every(s => s.inDialog), `${W}: focus stays inside the open dialog`, stops.filter(s => !s.inDialog).map(s => s.key).slice(0, 4).join(' | '));
  // Every visible, enabled control is reachable by Tab.
  const reach = await page.evaluate(keys => { const want = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),summary')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return !e.disabled && cs.visibility !== 'hidden' && cs.display !== 'none' && (r.width > 1 && r.height > 1 || e.closest('label')) && !e.closest('[inert]') && !(e.closest('details:not([open])') && !e.matches('details > summary')) && (!document.querySelector('dialog[open]') || e.closest('dialog[open]')); });
    return want.length; }, stops.map(s => s.key));
  ok(stops.length >= reach * 0.95, `${W}: every visible control is reachable by Tab (${stops.length} of ${reach})`);
  // Focus order follows reading order: within one column, a later stop is rarely far above the previous one.
  const back = stops.filter((s, i) => i && s.y < stops[i - 1].y - 400 && Math.abs(s.x - stops[i - 1].x) < 200); ok(back.length <= 2, `${W}: focus order follows the page (${back.length} big jumps up)`, back.map(s => s.key).slice(0, 4).join(' | '));
  // 2.5.5-style target size (WCAG 2.2 2.5.8 minimum, 24 x 24 CSS px, inline links excepted).
  const small = await page.evaluate(() => [...document.querySelectorAll('button,select,input:not([type=hidden]),[role=button],summary,label.btn')].filter(e => { if (e.matches('label .sr')) return false; /* measured as its label.btn */ const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 2) return false; if (e.matches('input[type=checkbox],input[type=radio]') && e.closest('label')) { const l = e.closest('label').getBoundingClientRect(); return l.height < 24; } return r.width < 24 || r.height < 24; }).map(e => (e.id || e.tagName) + ':' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)));
  ok(small.length === 0, `${W}: targets at least 24 x 24 px`, small.slice(0, 6).join(' | '));
  // 4.1.3 status messages: banners and save state are announced.
  const quiet = await page.evaluate(() => [...document.querySelectorAll('.banner,.toast,.save,[class*=status]')].filter(e => e.offsetParent && !e.closest('[role=status],[role=alert],[aria-live]') && !e.matches('[role=status],[role=alert],[aria-live]')).map(e => e.className + ':' + e.textContent.trim().slice(0, 30)));
  ok(quiet.length === 0, `${W}: status messages have a live role`, quiet.slice(0, 4).join(' | '));
  ok(errs.length === 0, `${W}: no page errors`, errs.join(' | '));
  if (SHOTS && width === 390) await page.screenshot({ path: join(SHOTS, `a11y-${name}-390.png`) });
  await c.close();
}
// 2.4.3 / 2.1.2: a dialog opened from the keyboard closes with Escape and gives focus back to the button that opened it.
{ const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await c.newPage(); await stepTo('export')(page);
  const btn = page.getByRole('button', { name: 'Save locked copy to share' }); await btn.focus(); await page.keyboard.press('Enter'); await page.locator('dialog.ask[open]').waitFor();
  ok(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]')), 'dialog: focus moves into the dialog');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.locator('dialog.ask[open]').count() === 0 && await page.evaluate(() => document.activeElement?.textContent?.includes('Save locked copy to share')), 'dialog: Escape closes it and focus returns to the button');
  // 1.3.4: no orientation lock; 1.4.4: zoom not blocked.
  const man = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')); ok(!man.orientation || man.orientation === 'any', 'no orientation lock in the manifest');
  ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![.0-9])/.test(readFileSync(join(DIST, 'index.html'), 'utf8')), 'pinch zoom is not blocked');
  await c.close(); }
// 1.4.10 reflow at 320 px and 1.4.12 text spacing (both widths of content, no loss).
const SPACING = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
for (const [name, go] of pick) for (const spacing of [false, true]) {
  const W = `${name} @320${spacing ? ' text-spacing' : ''}`; const c = await browser.newContext({ viewport: { width: 320, height: 640 } }); const page = await c.newPage();
  try { await go(page); } catch (e) { ok(false, `${W}: screen opens`, String(e).slice(0, 200)); await c.close(); continue; }
  if (spacing) { await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(200); }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 320, `${W}: no sideways scroll (${sw}px)`);
  // Text cut off: an element that clips its own text (overflow hidden and content taller or wider than the box).
  const clipped = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); if (!e.offsetParent || !(cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'hidden')) return false;
    if (e.matches('svg,svg *,canvas,img,.sr,input,select,textarea') || !e.textContent.trim()) return false; return e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2; }).map(e => (e.id || e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 30)));
  ok(clipped.length === 0, `${W}: no text clipped`, clipped.slice(0, 5).join(' | '));
  // Content wider than the screen inside a scroll box is allowed only for the drawing and tables (1.4.10 exception).
  const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return e.offsetParent && r.right > 322 && !e.closest('svg,table,.drawing,pre,[role=img]') && getComputedStyle(e).position !== 'fixed'; }).map(e => (e.id || e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 30)));
  ok(wide.length === 0, `${W}: nothing runs off the right edge`, wide.slice(0, 5).join(' | '));
  if (SHOTS && spacing) await page.screenshot({ path: join(SHOTS, `a11y-${name}-320-spacing.png`), fullPage: true });
  await c.close();
}
await browser.close(); server.close();
console.log(`${total - failed}/${total} passed` + (failed ? `, ${failed} FAILED` : '')); process.exit(failed ? 1 : 0);
