// Builds the service worker at build time: cache name from a hash of the build, and a precache list of every
// emitted file (lazy JS chunks, CSS, fonts, the CAD WASM) so the app and every export work offline after one visit.
import { createHash } from 'node:crypto';

export const SW_TEMPLATE = `// Generated at build time by sw-build.ts. Do not edit dist/sw.js by hand.
const VERSION = __VERSION__;
const C = 'opa-' + VERSION;
const PRECACHE = __PRECACHE__;
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(PRECACHE))); });
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); if (e.data === 'VERSION' && e.source) e.source.postMessage({ version: VERSION }); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('opa-') && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Network first, so a new deploy is picked up. Nothing is written to the cache here: the app shell comes only from
    // this worker's own precache, so a rule page (or a newer deploy's index.html) can never replace it.
    // Offline: the page's own precached copy (rule pages), else the app shell, but only for the app's own routes.
    const scope = new URL('./', self.registration ? self.registration.scope : location.href).pathname;
    const p = url.pathname; const appRoute = p === scope || p === scope + 'index.html';
    e.respondWith(fetch(req).catch(() => caches.match(req, { cacheName: C, ignoreSearch: true }).then(h => h || (appRoute ? caches.match('./index.html', { cacheName: C }).then(x => x || caches.match('./', { cacheName: C })) : Response.error()))));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: C, ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { if (r.ok && url.pathname.includes('/assets/')) { const copy = r.clone(); caches.open(C).then(c => c.put(req, copy)); } return r; })));
});
`;

/** files: paths relative to the site root (no leading slash). Returns the service worker source. */
export function buildServiceWorker(files: string[], indexHtml: string): { source: string; version: string; precache: string[] } {
  const precache = ['./', ...[...new Set(files)].filter(f => f !== 'sw.js' && !f.endsWith('.map')).sort().map(f => './' + f)];
  const version = createHash('sha256').update(precache.join('\n')).update(indexHtml).digest('hex').slice(0, 12);
  const source = SW_TEMPLATE.replace('__VERSION__', JSON.stringify(version)).replace('__PRECACHE__', JSON.stringify(precache));
  return { source, version, precache };
}
