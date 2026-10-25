// Drafting-graphics visual regression for the Pro workspace (cold design review, Oct 2026): on the rendered SVG,
// no check pin overlaps drawing text or another pin, no dimension is drawn twice on the same two points, no drawing text
// is smaller than the readable minimum, the status bar never clips at 1024 px, the phone header and sheet title never
// truncate, the command line is hidden on touch, and the north arrow never says "N ?" on the sheet.
// Run: npm run build && node e2e/cadviz.mjs   (DIST=/path/to/frozen/dist to test a frozen copy)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, pdfPage } from './sheetcheck.mjs';
const SHOTS = process.env.SHOTS ?? '/home/claude/stress/cad_shots/v4'; try { mkdirSync(SHOTS, { recursive: true }); } catch { /* read-only: no shots */ }

const here = new URL('.', import.meta.url).pathname; const DIST = process.env.DIST ?? resolve(here, '../dist');
const PDFJS = resolve(here, '../node_modules/pdfjs-dist/build');
let failed = 0; const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c || !x ? '' : ' :: ' + x}`); if (!c) failed++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (u.pathname.startsWith('/__pdfjs/')) { const f = join(PDFJS, u.pathname.slice(9)); if (existsSync(f)) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(f)); } else { res.writeHead(404); res.end(); } return; } let f = join(DIST, decodeURIComponent(u.pathname.replace('/open-permit-hub/', '')) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html'); if (!existsSync(f)) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
const browser = await chromium.launch(); const SVG = '[data-testid=viewport] svg';
const open = async (width, { pro = true, scheme = 'light', state, demo = true } = {}) => {
  const phone = width < 600; const c = await browser.newContext({ storageState: state, viewport: { width, height: phone ? 844 : width <= 1024 ? 768 : 900 }, colorScheme: scheme, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
  const page = await c.newPage(); if (pro) await page.addInitScript(() => { try { localStorage.setItem('opa.ws', 'pro'); } catch { /* */ } });
  await page.goto(BASE); if (demo) await page.getByRole('button', { name: /Try the demo lot/ }).click(); else { /* the saved project reopens where it was left */ } if (pro) { await page.locator(SVG).waitFor(); await page.waitForTimeout(500); } return { c, page };
};
const plan = async page => { const cmd = async (...l) => { for (const x of l) { await page.locator('#pw-cmd-in').fill(x); await page.locator('#pw-cmd-in').press('Enter'); } };
  await cmd('RM', 'BED', '28.5,108.5', '37.5,119.5'); await cmd('RM', 'BATH', '37.9,108.5', '47.5,115'); await cmd('RM', 'KITCHEN', '37.9,115.4', '47.5,127.5'); await cmd('RM', 'LIVING', '28.5,119.9', '37.5,127.5');
  await cmd('WI', '32,108.5'); await cmd('WI', '28.5,114'); await cmd('DR', '37.5,117'); await cmd('DR', '42,115'); await cmd('WI', '47.5,121'); await cmd('DR', '33,127.5');
  await cmd('DLI', '28,128', '48,128', '38,131'); await cmd('DLI', '48,108', '48,115', '51,111'); await cmd('DLI', '48,115', '48,128', '51,121');
  await cmd('LE', '42,111', '@7,-4', '', '1-HR WALL AT PROPERTY LINE'); await cmd('T', '50,124', 'NEW 2X4 PARTITIONS'); await page.keyboard.press('Escape'); await page.mouse.move(2, 2); await page.waitForTimeout(400); };
/** Geometry checks run in the page on the rendered SVG. */
const measure = page => page.evaluate(() => {
  const vp = document.querySelector('[data-testid=viewport]').getBoundingClientRect();
  const inView = r => r.right > vp.left && r.left < vp.right && r.bottom > vp.top && r.top < vp.bottom && r.width > 0;
  const texts = [...document.querySelectorAll('[data-testid=viewport] svg text.tx')].filter(t => !t.closest('.paper')).map(t => ({ t, r: t.getBoundingClientRect() })).filter(x => inView(x.r));
  const pins = [...document.querySelectorAll('[data-testid=viewport] [data-pin] circle:not(.pin-at)')].map(c => c.getBoundingClientRect()).filter(inView);
  const hit = (a, b, m = 0) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;
  let pinText = 0, pinPin = 0; const bad = [];
  pins.forEach((p, i) => { texts.forEach(x => { if (hit(p, x.r, 1)) { pinText++; bad.push(x.t.textContent); } }); pins.forEach((q, j) => { if (j > i && hit(p, q, 1)) pinPin++; }); });
  const small = texts.map(x => { const m = x.t.getScreenCTM(); const px = (+x.t.getAttribute('font-size')) * Math.hypot(m.a, m.b); return [x.t.textContent, px]; }).filter(([, px]) => px < 7.95);
  const dims = [...document.querySelectorAll('[data-testid=viewport] [data-dim]')].map(g => { const [a, b, c2, d] = g.getAttribute('data-dim').split(',').map(Number); const k1 = `${Math.round(a / 25)},${Math.round(b / 25)}`, k2 = `${Math.round(c2 / 25)},${Math.round(d / 25)}`; return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; });
  const dup = dims.length - new Set(dims).size;
  return { pins: pins.length, texts: texts.length, pinText, pinPin, bad: bad.slice(0, 5), small: small.slice(0, 5), nSmall: small.length, dims: dims.length, dup, allText: texts.map(x => x.t.textContent) };
});

for (const scheme of ['light', 'dark']) {
  const { c, page } = await open(1440, { scheme }); await plan(page);
  for (const [view, key] of [['default (ADU)', null], ['extents', 'f'], ['ADU', 'a']]) {
    if (key) { await page.locator(SVG).focus(); await page.keyboard.press('Escape'); await page.keyboard.press(key); await page.mouse.move(2, 2); await page.waitForTimeout(400); }
    const m = await measure(page);
    ok(m.pins > 0 && m.pinText === 0 && m.pinPin === 0, `1440 ${scheme} ${view}: ${m.pins} pins overlap no drawing text (0) and no other pin (0)`, JSON.stringify({ pinText: m.pinText, pinPin: m.pinPin, bad: m.bad }));
    ok(m.dims >= 6 && m.dup === 0, `1440 ${scheme} ${view}: ${m.dims} dimensions, none drawn twice on the same two points`, `dup ${m.dup}`);
    ok(m.texts > 5 && m.nSmall === 0, `1440 ${scheme} ${view}: every drawing text is at least 8 px on screen`, JSON.stringify(m.small));
    ok(!m.allText.some(s => /N \?|NORTH NOT SET/.test(s)), `1440 ${scheme} ${view}: no "N ?" / "NORTH NOT SET" on the drawing`);
  }
  ok((await page.locator('[data-testid=north-not-set]').count()) === 1, `1440 ${scheme}: "north not set" is a Checks item`);
  await page.getByRole('button', { name: 'Hide markups' }).click(); await page.waitForTimeout(150); ok((await page.locator('[data-pin]').count()) === 0, `1440 ${scheme}: Hide markups hides every pin`);
  await page.getByRole('button', { name: 'Show markups' }).click(); await page.waitForTimeout(150); ok((await page.locator('[data-pin]').count()) > 0, `1440 ${scheme}: Show markups brings them back`);
  ok((await page.locator('[data-pin] .pin-ld').count()) === (await page.locator('[data-pin]').count()), `1440 ${scheme}: every pin has a leader to its object`);
  await c.close();
}
// Default view opens on the ADU, not the whole lot.
{ const { c, page } = await open(1440); const k = +(await page.locator(SVG).getAttribute('data-k')); await page.locator(SVG).focus(); await page.keyboard.press('f'); await page.waitForTimeout(200); const k2 = +(await page.locator(SVG).getAttribute('data-k'));
  ok(k > k2 * 2, 'Pro opens zoomed to the ADU (more than 2x the zoom-extents scale)', `${k} vs ${k2}`); await c.close(); }
// Status bar at 1024: nothing clipped, overflow goes to the "…" menu in priority order.
for (const w of [1024, 1180, 1440]) { const { c, page } = await open(w);
  const r = await page.evaluate(() => { const f = document.querySelector('.pw-status').getBoundingClientRect(); const kids = [...document.querySelectorAll('.pw-status > *')].filter(e => !e.classList.contains('grow')).map(e => [e.className || e.tagName, e.getBoundingClientRect()]);
    return { clipped: kids.filter(([, b]) => b.width > 0 && (b.right > f.right + 0.5 || b.left < f.left - 0.5)).map(([n]) => n), xy: document.querySelector('.pw-xy').getBoundingClientRect().width, scale: document.querySelector('.pw-scale').textContent, items: [...document.querySelectorAll('.pw-status [data-si]')].map(e => e.getAttribute('data-si')) }; });
  ok(r.clipped.length === 0 && r.xy >= 150 && r.scale.length > 3, `${w}: status bar shows coords and scale and clips nothing`, JSON.stringify(r));
  const more = page.getByRole('button', { name: /More status bar items/ });
  if (await more.count()) { await more.click(); const inMenu = await page.locator('.pw-more-pop [data-si]').evaluateAll(es => es.map(e => e.getAttribute('data-si')));
    ok(inMenu.length > 0 && !inMenu.includes('snap') && (inMenu.includes('theme') || inMenu.includes('lwt') || inMenu.includes('polar')), `${w}: overflow menu holds the lowest-priority items (${inMenu.join(', ')})`); }
  await c.close(); }
// Phone: header and issue title are not truncated (2 lines allowed); command line hidden on touch; scale chip in the canvas.
{ const { c, page } = await open(390);
  const t = await page.evaluate(() => { const h = document.querySelector('.pw-ph-title h1'); const sub = document.querySelector('.pw-ph-title .sub'); const pk = document.querySelector('.pw-peek b');
    const full = e => !e || (e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1); return { h: full(h), sub: full(sub), pk: full(pk), cmd: !!document.querySelector('#pw-cmd-in'), chip: document.querySelector('.pw-scale-chip')?.textContent ?? '' }; });
  ok(t.h && t.sub && t.pk, '390: phone header and sheet title show in full (no ellipsis)', JSON.stringify(t)); ok(!t.cmd, '390: command line is hidden on touch'); ok(/=/.test(t.chip), '390: scale shown as a chip in the canvas corner');
  const m = await measure(page); ok(m.pinText === 0 && m.pinPin === 0, `390: pins overlap no text or pin (${m.pins} pins)`, JSON.stringify(m.bad)); ok(m.nSmall === 0, '390: no drawing text under 8 px', JSON.stringify(m.small));
  await c.close(); }
// Mode: Guided is the default for homeowners; the same segmented control is in both modes; "For drafters" makes Pro the default.
{ const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await c.newPage(); await page.goto(BASE);
  await page.getByRole('button', { name: /Try the demo lot/ }).click(); ok(await page.getByRole('heading', { level: 2, name: 'The lot' }).isVisible(), 'homeowner default: the demo opens in Guided');
  ok(await page.getByRole('group', { name: 'Workspace mode' }).isVisible(), 'Guided shows the same Guided/Pro segmented control');
  const dims = await page.locator('svg [data-dim]').count(); ok(dims > 0, 'Guided lot sketch uses the shared drawing renderer (dims from drafting)', String(dims));
  await page.getByRole('button', { name: 'All projects' }).first().click(); await page.getByRole('button', { name: /For drafters/ }).click();
  ok(await page.evaluate(() => localStorage.getItem('opa.ws')) === 'pro', 'after "For drafters", Pro is remembered as this device\'s mode');
  await c.close(); }

// One sheet model (review 2): the screen layouts A-1, A-2, G-2 and the exported PDF pages pass the same checks:
// 0 label overlaps, 0 duplicate dims, text at least 1/8" plotted, title block fields, true scale, A-2 floor plan entities.
const sheetData = page => page.evaluate(() => { const g = document.querySelector('[data-testid=viewport] .paper'); if (!g) return null;
  // Advance widths at a large size (tiny user-unit font sizes are hinted and rounded by the browser), scaled to the text's own size.
  const probe = t => { const c = t.cloneNode(true); c.removeAttribute('transform'); c.setAttribute('font-size', '100'); g.appendChild(c); const w = c.getComputedTextLength(); c.remove(); return w * (+t.getAttribute('font-size')) / 100; };
  const texts = [...g.querySelectorAll('text')].map(t => { const rot = (t.getAttribute('transform') ?? '').match(/rotate\(([-\d.]+)/); return { s: t.textContent, x: +t.getAttribute('x'), y: -(+t.getAttribute('y')), size: +t.getAttribute('font-size'), w: probe(t), ang: -(rot ? +rot[1] : 0) * Math.PI / 180, g: t.getAttribute('data-g') }; })
    .map((t, i, all) => t);
  [...g.querySelectorAll('text')].forEach((el, i) => { const t = texts[i]; const an = el.getAttribute('text-anchor'); const k = an === 'middle' ? 0.5 : an === 'end' ? 1 : 0; t.x -= Math.cos(t.ang) * t.w * k; t.y -= Math.sin(t.ang) * t.w * k; });
  const segs = []; for (const p of g.querySelectorAll('path')) { if (p.getAttribute('stroke') === 'none') continue; const d = p.getAttribute('d'); const re = /([MLZ])\s*(-?[\d.]+)?\s*(-?[\d.]+)?/g; let m, cx = 0, cy = 0, sx = 0, sy = 0;
    while ((m = re.exec(d))) { if (m[1] === 'Z') { segs.push({ layer: p.getAttribute('data-layer'), g: p.getAttribute('data-g'), x0: cx, y0: -cy, x1: sx, y1: -sy }); cx = sx; cy = sy; continue; } const x = +m[2], y = +m[3]; if (m[1] === 'M') { sx = cx = x; sy = cy = y; } else { segs.push({ layer: p.getAttribute('data-layer'), g: p.getAttribute('data-g'), x0: cx, y0: -cy, x1: x, y1: -y }); cx = x; cy = y; } } }
  return { texts, segs, no: g.getAttribute('data-sheet') }; });
const sheetOk = (where, r, a2) => {
  ok(r.over.length === 0, `${where}: 0 label overlaps`, r.over.slice(0, 5).join(' | ')); ok(r.dup.length === 0, `${where}: 0 duplicate dimensions`, r.dup.join(', '));
  ok(r.minSize >= 0.125 - 1e-3, `${where}: all text at least 1/8" plotted (${(r.minSize * 72).toFixed(1)} pt)`); ok(r.fields.length === 0 && !!r.sheetNo, `${where}: title block fields present (sheet ${r.sheetNo})`, r.fields.join(', '));
  if (a2) { ok(!!r.scale && r.scale.err <= 1 / 32, `${where}: a 20 ft wall measures ${r.scale?.wallIn.toFixed(4)}" at ${r.scale?.label} (within 1/32")`, JSON.stringify(r.scale));
    ok(['A-WALL', 'A-DOOR', 'A-GLAZ', 'A-DOOR-IDEN', 'A-GLAZ-IDEN', 'A-AREA-IDEN'].every(l => r.layers.includes(l)), `${where}: A-2 has walls, doors, windows and tags`, r.layers.join(',')); } };
let a2Desk = null, deskState = null;
for (const [w, scheme] of [[1440, 'light'], [1440, 'dark'], [1024, 'light']]) { const { c, page } = await open(w, { scheme }); await plan(page);
  for (const [tab, no] of [['A-1 Site', 'A-1'], ['A-2 Floor', 'A-2'], ['G-2 Markup', 'G-2']]) { await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(500);
    const d = await sheetData(page); if (w === 1440 && scheme === 'light' && no === 'A-2' && d) a2Desk = d.texts.map(t => t.s).sort(); ok(d?.no === no, `${w} ${scheme}: tab ${tab} shows sheet ${no}`); if (!d) continue; sheetOk(`screen ${w} ${scheme} ${no}`, check(d), no === 'A-2');
    await page.screenshot({ path: join(SHOTS, `screen-${w}-${scheme}-${no}.png`) }).catch(() => {}); }
  if (w === 1440 && scheme === 'light') { deskState = await c.storageState({ indexedDB: true });
    await page.getByRole('tab', { name: 'Model' }).click(); await page.waitForTimeout(300);
    const t = await page.evaluate(() => [...document.querySelectorAll('[data-testid=viewport] svg text')].map(x => x.textContent));
    ok(!t.some(s => /^(STREET|KEYNOTES|GRAPHIC SCALE|N)$/.test(s)), 'Model space has no sheet annotation (north arrow, keynote legend, graphic scale, STREET)');
    // Selection feedback: grips, highlight, and the right panel switches to Properties.
    const box = await page.locator(SVG).boundingBox(); await page.locator(SVG).focus(); await page.keyboard.press('a'); await page.waitForTimeout(300);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => ({ grips: document.querySelectorAll('[data-testid=viewport] .grip').length, hl: document.querySelectorAll('[data-testid=viewport] .selo, [data-testid=viewport] .hl').length, props: document.querySelector('[role=tab][aria-selected=true][id^=tab-]')?.textContent ?? document.querySelector('#pw-tabpanel')?.getAttribute('aria-labelledby') ?? '' }));
    ok(s1.grips > 0 && s1.hl > 0 && /Propert|Details/i.test(s1.props), 'select: grips, highlight and the Properties panel', JSON.stringify(s1)); await page.screenshot({ path: join(SHOTS, 'screen-1440-select.png') }).catch(() => {});
    // PDF export: the same sheets, rendered with pdf-lib, read back and rasterized with pdf.js.
    await page.getByRole('button', { name: 'Export', exact: true }).first().click(); await page.waitForTimeout(400);
    for (const [btn, tag] of [['Draft site plan (PDF, 24x36)', '24x36'], [/Draft plot plan.*11x17/, '11x17'], [/Draft plot plan.*(letter|8\.5)/i, 'letter']]) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: btn }).first().click()]); const bytes = readFileSync(await dl.path());
      const pdfjs = await import(join(resolve(here, '../node_modules/pdfjs-dist/legacy/build'), 'pdf.mjs')); const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
      for (let i = 1; i <= doc.numPages; i++) { const r = check(await pdfPage(pdfjs, doc, i)); sheetOk(`PDF ${tag} p${i}`, r, r.sheetNo === 'A-2'); }
      const imgs = await page.evaluate(async b64 => { const pdfjs = await import('/__pdfjs/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.mjs'; const d = await pdfjs.getDocument({ data: Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)) }).promise; const out = [];
        for (let i = 1; i <= d.numPages; i++) { const pg = await d.getPage(i); const vp = pg.getViewport({ scale: 100 / 72 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvas: cv, canvasContext: cv.getContext('2d'), viewport: vp }).promise; out.push(cv.toDataURL('image/png').split(',')[1]); } return out; }, bytes.toString('base64'));
      ok(imgs.length === doc.numPages, `PDF ${tag}: ${imgs.length} pages rasterized with pdf.js`); imgs.forEach((b, i) => { try { writeFileSync(join(SHOTS, `pdf-${tag}-p${i + 1}.png`), Buffer.from(b, 'base64')); } catch { /* */ } }); }
  }
  await c.close(); }
// Review 3 F2: the phone opens the same project and its A-2 is the same sheet (same text, same model) as desktop.
{ const { c, page } = await open(390, { state: deskState, demo: false }); await page.getByRole('tab', { name: 'A-2 Floor' }).click(); await page.waitForTimeout(500);
  const d = await sheetData(page); const ph = d ? d.texts.map(t => t.s).sort() : [];
  ok(!!a2Desk && JSON.stringify(ph) === JSON.stringify(a2Desk) && ph.includes('BEDROOM'), `390 vs 1440: A-2 is the same sheet (${ph.length} texts, rooms and schedules)`, JSON.stringify({ phone: ph.length, desk: a2Desk?.length, only: ph.filter(x => !a2Desk?.includes(x)).slice(0, 5) }));
  sheetOk('screen 390 A-2', check(d), true); await page.screenshot({ path: join(SHOTS, 'screen-390-A-2.png') }).catch(() => {}); await c.close(); }
{ const { c, page } = await open(390); const tabs = await page.getByRole('tab', { name: 'A-2 Floor' }).count(); ok(tabs === 1 && await page.getByRole('tab', { name: 'A-2 Floor' }).isVisible(), '390: sheet tabs reachable on the phone');
  ok(await page.getByRole('button', { name: 'Line', exact: true }).isVisible(), '390: the Line tool is in the phone tool bar');
  await page.getByRole('tab', { name: 'A-2 Floor' }).click(); await page.waitForTimeout(400); ok((await sheetData(page))?.no === 'A-2', '390: A-2 opens on the phone'); await c.close(); }
await browser.close(); server.close(); console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
