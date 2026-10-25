// Screenshots of the Pro workspace for design review: node e2e/_proshots.mjs [outdir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname; const DIST = resolve(here, '../dist'); const OUT = process.argv[2] ?? '/home/claude/stress/cad_shots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => { const u = new URL(req.url, 'http://x'); let f = join(DIST, decodeURIComponent(u.pathname.replace('/open-permit-hub/', '')) || 'index.html'); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html'); if (!existsSync(f)) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${server.address().port}/open-permit-hub/`;
const browser = await chromium.launch();
async function shot(name, width, height, scheme, setup) {
  const c = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: width < 600 ? 2 : 1, hasTouch: width < 600, isMobile: width < 600 });
  const page = await c.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('opa.ws', 'pro'); } catch {} }); await page.goto(BASE);
  await page.getByRole('button', { name: /Try the demo lot/ }).click(); await page.locator("[data-testid=viewport] svg").waitFor({ timeout: 8000 }).catch(async () => { console.log("NOVIEW", errs, (await page.content()).slice(0, 600)); }); await page.waitForTimeout(500);
  if (setup) await setup(page); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` }); if (errs.length) console.log(name, 'ERRORS', errs); else console.log('ok', name); await c.close();
}
const only = process.env.ONLY;
async function plan(page) {
  const cmd = async (...l) => { for (const x of l) { await page.locator('#pw-cmd-in').fill(x); await page.locator('#pw-cmd-in').press('Enter'); } };
  if (!(await page.locator('#pw-cmd-in').isVisible())) return;
  await cmd('RM', 'BED', '28.5,108.5', '37.5,119.5'); await cmd('RM', 'BATH', '37.9,108.5', '47.5,115'); await cmd('RM', 'KITCHEN', '37.9,115.4', '47.5,127.5'); await cmd('RM', 'LIVING', '28.5,119.9', '37.5,127.5');
  await cmd('WI', '32,108.5'); await cmd('WI', '28.5,114'); await cmd('DR', '37.5,117'); await cmd('DR', '42,115'); await cmd('WI', '47.5,121'); await cmd('DR', '33,127.5');
  await cmd('DLI', '28,128', '48,128', '38,131'); await cmd('DLI', '48,108', '48,115', '51,111'); await cmd('DLI', '48,115', '48,128', '51,121');
  await cmd('LE', '47.8,111', '@4,-4', '', '1-HR WALL AT PROPERTY LINE'); await cmd('T', '50,124', 'NEW 2X4 PARTITIONS');
  await page.keyboard.press('Escape');
}
const zoomAdu = async page => { await page.locator('[data-testid=viewport] svg').focus(); await page.keyboard.press('Escape'); await page.keyboard.press(']'); await page.keyboard.press('Shift+F'); await page.keyboard.press('Escape'); await page.mouse.move(5, 5); };
const S = [
  ['pro-1440-light', 1440, 900, 'light', plan], ['pro-1440-dark', 1440, 900, 'dark', async p => { await plan(p); await zoomAdu(p); }], ['pro-1440-light-zoom', 1440, 900, 'light', async p => { await plan(p); await zoomAdu(p); }], ['pro-1024', 1024, 768, 'light', plan],
  ['pro-390-plan', 390, 844, 'light'], ['pro-390-sheet', 390, 844, 'light', async p => { await p.getByRole('button', { name: 'Checks' }).click(); }],
  ['pro-1440-a1', 1440, 900, 'light', async p => { await plan(p); await p.getByRole('tab', { name: 'A-1 Site' }).click(); }],
  ['pro-1440-a2', 1440, 900, 'light', async p => { await plan(p); await p.getByRole('tab', { name: 'A-2 Floor' }).click(); }],
];
for (const [n, w, h, sc, f] of S) if (!only || n.includes(only)) await shot(n, w, h, sc, f);
await browser.close(); server.close();
