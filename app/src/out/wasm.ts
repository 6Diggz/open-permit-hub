/** One lazy loader for the Clean and Fix WASM module (CAD read/write), shared by every caller. */
type M = typeof import('../clean-wasm/cleanfix.js');
let loading: Promise<M> | null = null;
export function cleanfix(): Promise<M> {
  loading ??= import('../clean-wasm/cleanfix.js').then(async m => { await m.default(); return m; }).catch(e => { loading = null; throw e; });
  return loading;
}
/** WASM traps ("unreachable", out of memory) become a plain message instead of developer text. */
export function plainWasmError(e: unknown): string {
  const s = String((e as Error)?.message ?? e);
  if (/unreachable|RuntimeError|memory access out of bounds|out of memory/i.test(s)) return 'The CAD engine stopped on this file. Save as DXF 2018 instead, or ask the sender to save the file again.';
  if (/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(s)) return 'Part of the app could not load. Reload the page; if you are offline, connect once so the app can finish downloading.';
  return s;
}
