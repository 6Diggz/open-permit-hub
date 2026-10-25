// Browser checks for the parity features (parcel autofill, room drawing, review markup) at 390 and 1440.
// City map answers come from recorded fixtures (src/test/fixtures/parcel); no live service is ever called.
//   npm run build && node e2e/feat.mjs            SHOTS=/path node e2e/feat.mjs  (also saves screenshots)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = new URL('.', import.meta.url).pathname; const DIST = resolve(here, '../dist'); const FIX = resolve(here, '../src/test/fixtures/parcel');
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AXE = readFileSync(resolve(here, '../node_modules/axe-core/axe.min.js'), 'utf8'); const tmp = mkdtempSync(join(tmpdir(), 'opa-feat-'));
let failed = 0, total = 0; const ok = (c, n, x = '') => { total++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c || !x ? '' : ' :: ' + x}`); if (!c) failed++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith('/open-permit-hub/')) return res.writeHead(404).end();
  let f = join(DIST, decodeURIComponent(u.pathname.slice(17)) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(DIST) || !existsSync(f)) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
const calls = Object.assign({}, ...readdirSync(FIX).map(f => JSON.parse(readFileSync(join(FIX, f), 'utf8')).calls));
const norm = u => decodeURIComponent(u).replace(/\+/g, ' ');
const byNorm = new Map(Object.entries(calls).map(([k, v]) => [norm(k), v]));
const browser = await chromium.launch();
const ctx = (w, extra = {}) => browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, acceptDownloads: true, bypassCSP: true, ...extra });
/** Serve the city map hosts from fixtures. `mode` = 'ok' | 'fail'. Records every request so the opt-in can be checked. */
async function cityMap(page, mode = 'ok') {
  const seen = [];
  await page.route(/https:\/\/(maps|zimas)\.lacity\.org\/.*/, route => { const u = route.request().url(); seen.push(u);
    if (mode === 'fail') return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'down' });
    const hit = byNorm.get(norm(u)); return route.fulfill({ status: hit ? hit.status : 404, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(hit ? hit.body : { error: { code: 404 } }) }); });
  return seen;
}
const axe = async (page, rules) => { await page.addScriptTag({ content: AXE }); return page.evaluate(async r => (await window.axe.run(document, { runOnly: { type: 'rule', values: r } })).violations.map(v => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`), rules); };
const RULES = ['button-name', 'label', 'aria-allowed-role', 'color-contrast', 'nested-interactive', 'scrollable-region-focusable', 'aria-required-children', 'list', 'listitem', 'th-has-data-cells'];
const step = async (page, k) => { await page.evaluate(k => { location.hash = '#step=' + k; }, k); await page.waitForTimeout(200); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: false }); };
const fullShot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true }); };

for (const width of [390, 1440]) {
  const W = `@${width}`;
  // FEATURE 1: parcel autofill
  { const c = await ctx(width); const page = await c.newPage(); const seen = await cityMap(page);
    await page.goto(BASE); await page.getByRole('button', { name: 'Start my project' }).click(); await page.getByRole('heading', { level: 2, name: 'The lot' }).waitFor();
    ok(await page.getByRole('button', { name: 'Look up' }).isDisabled(), `parcel: Look up is off until an address is typed ${W}`);
    await page.fill('#addr', '4305 Edenhurst Ave, Los Angeles, CA 90039'); await page.waitForTimeout(300);
    ok(seen.length === 0, `parcel: nothing is sent before tapping Look up ${W}`, String(seen.length));
    ok(await page.getByText('Only the street address is sent').isVisible(), `parcel: the screen says what leaves the device ${W}`);
    await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText('4305 W EDENHURST AVE').first().waitFor({ timeout: 8000 }).then(() => true, () => false), `parcel: match shown ${W}`, await page.locator('[role=status]').allTextContents().then(x => x.join(' | ')));
    ok(await page.inputValue('#apn') === '5594-014-021' && await page.inputValue('#zone') === 'R1-1-RIO', `parcel: APN and zone filled ${W}`, await page.inputValue('#apn') + ' / ' + await page.inputValue('#zone'));
    ok((await page.inputValue('#lw')).startsWith("40' ") && (await page.inputValue('#ld')).startsWith("140' "), `parcel: lot size filled ${W}`, await page.inputValue('#lw') + ' / ' + await page.inputValue('#ld'));
    ok(await page.locator('#jur').inputValue() === 'la-city', `parcel: city from the real boundary ${W}`);
    ok(await page.locator('#apn-h').textContent() === 'From parcel map, verify on site', `parcel: filled value is tagged ${W}`);
    ok(seen.every(u => /^https:\/\/(maps|zimas)\.lacity\.org\//.test(u)) && seen.every(u => !/owner|name=/i.test(u)), `parcel: only the city map hosts, only the address ${W}`);
    await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `parcel-filled-${width}.png`);
await page.getByText('Filled from the parcel map').scrollIntoViewIfNeeded(); await shot(page, `parcel-status-${width}.png`);
    await page.fill('#apn', '5594-014-099'); ok(await page.locator('#apn-h').textContent() !== 'From parcel map, verify on site', `parcel: an edit overrides and removes the tag ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `parcel: axe ${W}`, v.join(' | '));
    // offline and failed lookups fall back to manual entry
    await c.setOffline(true); await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText("You're offline. Enter the lot by hand").waitFor({ timeout: 5000 }).then(() => true, () => false), `parcel: offline message ${W}`); await page.getByText("You're offline").scrollIntoViewIfNeeded(); await shot(page, `parcel-offline-${width}.png`);
    await c.setOffline(false); await page.unrouteAll(); await cityMap(page, 'fail'); await page.getByRole('button', { name: 'Look up' }).click();
    ok(await page.getByText('The city map did not answer').waitFor({ timeout: 5000 }).then(() => true, () => false), `parcel: failed service message ${W}`);
    ok(await page.inputValue('#apn') === '5594-014-099', `parcel: a failed lookup keeps what the user typed ${W}`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); ok(await page.getByRole('button', { name: 'Buscar' }).isVisible(), `parcel: Spanish ${W}`);
    await c.close(); }

  // FEATURE 2: rooms
  { const c = await ctx(width); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'rooms');
    ok(await page.getByText('No rooms yet.').isVisible(), `rooms: empty state ${W}`); await shot(page, `rooms-empty-${width}.png`);
    await page.getByRole('button', { name: 'Add a room', exact: true }).click(); await page.getByRole('button', { name: 'Add a room', exact: true }).click();
    const rooms = page.locator('.drawing svg polygon[role=button]'); ok(await rooms.count() === 2, `rooms: two rooms drawn ${W}`);
    await page.fill('#rn', 'Bedroom 1'); await page.locator('#rtw').fill("9' 6\""); await page.locator('#rtw').press('Tab'); await page.locator('#rtd').fill("10'"); await page.locator('#rtd').press('Tab');
    ok((await rooms.nth(1).getAttribute('aria-label')).includes("9' 6\" x 10' 0\"") && (await rooms.nth(1).getAttribute('aria-label')).includes('tape-measured'), `rooms: tape size overrides the drawing ${W}`, await rooms.nth(1).getAttribute('aria-label'));
    await page.getByRole('button', { name: 'Add a window' }).click(); await page.getByRole('button', { name: 'Add a door' }).click();
    const before = await rooms.nth(1).getAttribute('points'); await rooms.nth(1).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp');
    ok(await rooms.nth(1).getAttribute('points') !== before, `rooms: keyboard nudge moves the room ${W}`);
    await page.locator('h1').first().click(); await page.getByRole('button', { name: 'Undo', exact: true }).locator('visible=true').first().click();
    ok(await rooms.nth(1).getAttribute('points') === before, `rooms: undo puts it back ${W}`);
    await page.getByRole('button', { name: 'Redo', exact: true }).locator('visible=true').first().click(); ok(await rooms.nth(1).getAttribute('points') !== before, `rooms: redo ${W}`);
    // drag a room with the pointer (touch-friendly: pointer events)
    const bb = await rooms.nth(0).boundingBox(); const p0 = await rooms.nth(0).getAttribute('points');
    await page.mouse.move(bb.x + 10, bb.y + 10); await page.mouse.down(); await page.mouse.move(bb.x - 40, bb.y + 10, { steps: 4 }); await page.mouse.up();
    ok(true, `rooms: pointer drag runs without error ${W}`); ok(typeof p0 === 'string', `rooms: room has an outline ${W}`);
    ok(await page.getByText('Bedrooms from your rooms: 1').isVisible(), `rooms: drawn rooms set the bedroom count ${W}`);
    const res = page.locator('.side .res', { hasText: 'Escape window in each sleeping room' }); ok(await res.count() > 0, `rooms: escape window check uses the rooms ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `rooms: axe ${W}`, v.join(' | '));
    if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `rooms: no sideways scroll at 390`);
    await rooms.nth(1).focus(); await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `rooms-drawn-${width}.png`); await fullShot(page, `rooms-full-${width}.png`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); ok(await page.getByRole('button', { name: 'Agregar un cuarto' }).isVisible(), `rooms: Spanish ${W}`);
    const ves = await axe(page, RULES); ok(ves.length === 0, `rooms: axe (es) ${W}`, ves.join(' | ')); await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en').catch(async () => page.locator('#lang').selectOption('en'));
    // A-2 sheet and DXF carry the rooms
    await step(page, 'export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Site plan for CAD (DXF)' }).click()]); const dxf = readFileSync(await dl.path(), 'utf8');
    ok(dxf.includes('A-AREA') && dxf.includes('BEDROOM 1') && dxf.includes('A-GLAZ'), `rooms: DXF has room, window layers ${W}`);
    await c.close(); }

  // FEATURE 3: review markup
  { const c = await ctx(width); const page = await c.newPage(); await page.goto(BASE); await page.getByRole('button', { name: 'Try the demo lot' }).click(); await step(page, 'review');
    ok(await page.getByText('No notes yet.').isVisible(), `review: empty state ${W}`);
    await page.fill('#rv-au', 'Ana (plan check)');
    await page.getByRole('button', { name: 'Place a pin on the plan' }).click(); const svg = page.locator('.drawing svg'); await svg.scrollIntoViewIfNeeded(); const b = await svg.boundingBox();
    await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.75); await page.locator('#rv-c').waitFor({ timeout: 5000 }); await page.fill('#rv-c', 'Show the 1-hour wall on the rear side.');
    await page.getByRole('button', { name: 'Add a note at the ADU' }).click(); await page.fill('#rv-c', 'Add the eave detail.');
    ok(await page.locator('.drawing svg g[role=button]').count() === 2, `review: two numbered pins on the plan ${W}`);
    await page.getByRole('button', { name: 'Resolved', exact: true }).click();
    const rows = page.locator('table.take tbody tr'); ok(await rows.count() === 2, `review: list mirrors the pins ${W}`);
    await page.getByRole('button', { name: /^Status/ }).click(); ok((await rows.first().textContent()).includes('Open'), `review: sort by status ${W}`);
    await page.getByRole('button', { name: /^Status/ }).click(); ok((await rows.first().textContent()).includes('Resolved'), `review: sort reverses ${W}`);
    const vb0 = await svg.getAttribute('viewBox'); await page.getByRole('button', { name: 'Show note 1 on the plan' }).first().click(); await page.waitForTimeout(100);
    ok(await svg.getAttribute('viewBox') !== vb0, `review: choosing a row zooms to its pin ${W}`); await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `review-zoom-${width}.png`);
    await page.getByRole('button', { name: 'Show the whole lot' }).click();
    await page.fill('#rv-l', '1. Show the fire-rated wall on the north side.\n2. Provide a window schedule.\n3) Smoke alarms in each bedroom.');
    await page.getByRole('button', { name: 'Split into items' }).click(); ok(await page.getByText('3 items found.').isVisible(), `review: letter splits into items ${W}`);
    await page.getByRole('button', { name: 'Make it a note on the plan' }).first().click(); await page.getByRole('button', { name: 'Answer in the checklist' }).first().click();
    ok(await page.locator('.drawing svg g[role=button]').count() === 3 && await page.getByRole('heading', { name: 'Correction checklist' }).isVisible(), `review: items become pins and checklist answers ${W}`, `${await page.locator('.drawing svg g[role=button]').count()} pins, heading ${await page.getByRole('heading', { name: 'Correction checklist' }).count()}`);
    const [rl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the response letter (text)' }).click()]); ok(readFileSync(await rl.path(), 'utf8').includes('1. Show the fire-rated wall'), `review: response letter ${W}`);
    const v = await axe(page, RULES); ok(v.length === 0, `review: axe ${W}`, v.join(' | '));
    if (width === 390) ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), `review: no sideways scroll at 390`);
    await page.locator('.drawing').scrollIntoViewIfNeeded(); await shot(page, `review-pins-${width}.png`); await fullShot(page, `review-full-${width}.png`);
    // pins travel in the .permitpack: a reviewer with no account opens it
    await step(page, 'export'); const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup' }).click()]); const file = join(tmp, `rev-${width}.permitpack`); await bk.saveAs(file);
    const c2 = await ctx(width); const r = await c2.newPage(); await r.goto(BASE); await r.locator('input[type=file][accept=".permitpack,.json"]').first().setInputFiles(file);
    await r.getByRole('heading', { level: 2 }).first().waitFor(); await step(r, 'review');
    ok(await r.locator('table.take tbody tr').count() === 3, `review: pins open on another device from the .permitpack ${W}`, `${await r.locator('table.take tbody tr').count()} rows; h2=${await r.getByRole('heading', { level: 2 }).first().textContent()}`);
    const [pdf] = await Promise.all([page.waitForEvent('download'), (await step(page, 'export'), page.getByRole('button', { name: 'Draft site plan (PDF, 24x36)' }).click())]); ok(!!(await pdf.path()), `review: PDF with markup sheet downloads ${W}`);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es'); await step(page, 'review'); ok(await page.getByRole('heading', { name: 'Notas de revisión' }).isVisible(), `review: Spanish ${W}`);
    await c2.close(); await c.close(); }
}
await browser.close(); server.close();
console.log(`${total - failed}/${total} passed` + (failed ? `, ${failed} FAILED` : '')); process.exit(failed ? 1 : 0);
