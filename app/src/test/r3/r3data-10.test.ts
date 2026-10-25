// r3data-10: duplicate .woff fonts (a .woff2 twin exists) are not precached; a lone .woff and the CAD WASM still are.
import { it, expect } from 'vitest';
import { buildServiceWorker } from '../../../sw-build';
it('skips .woff when the .woff2 twin ships, keeps the WASM', () => {
  const { precache } = buildServiceWorker(['index.html', 'assets/ps-400-normal-SBbinRkI.woff', 'assets/ps-400-normal-8Rpg0ruU.woff2', 'assets/solo-700-normal-AbCdEfGh.woff', 'assets/cleanfix_bg-C1234567.wasm'], '<html>');
  expect(precache).not.toContain('./assets/ps-400-normal-SBbinRkI.woff');
  expect(precache).toEqual(expect.arrayContaining(['./assets/ps-400-normal-8Rpg0ruU.woff2', './assets/solo-700-normal-AbCdEfGh.woff', './assets/cleanfix_bg-C1234567.wasm']));
});
it('r3data-10: font subsets for scripts the app never shows are not precached; latin-ext (Spanish) and the WASM are', () => {
  const { precache } = buildServiceWorker(['assets/public-sans-vietnamese-400-normal-TxZB8OSn.woff2', 'assets/x-cyrillic-400-normal-AbCdEfGh.woff2', 'assets/public-sans-latin-ext-400-normal-mk90oQqJ.woff2', 'assets/cleanfix_bg-C1234567.wasm', 'assets/cad.worker-Cf1Yw5xW.js'], '<html>');
  expect(precache).not.toContain('./assets/public-sans-vietnamese-400-normal-TxZB8OSn.woff2'); expect(precache).not.toContain('./assets/x-cyrillic-400-normal-AbCdEfGh.woff2');
  expect(precache).toEqual(expect.arrayContaining(['./assets/public-sans-latin-ext-400-normal-mk90oQqJ.woff2', './assets/cleanfix_bg-C1234567.wasm', './assets/cad.worker-Cf1Yw5xW.js']));
});
