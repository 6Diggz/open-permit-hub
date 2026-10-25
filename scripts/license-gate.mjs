// License gate for the web bundle: every production npm package must be under an allowed license.
// An allowlist (not a GPL blocklist): license-checker's --failOn matches exact strings only, so "GPL-3.0-only" slipped through.
// Usage (CI): cd app && node ../scripts/license-gate.mjs
import { execFileSync } from 'node:child_process';

export const ALLOWED = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'OFL-1.1', 'Zlib', 'Unlicense', 'MPL-2.0'];
/** True when an SPDX expression can be satisfied with allowed licenses: OR needs one side, AND needs both. */
export function allowed(expr, list = ALLOWED) {
  if (!expr || typeof expr !== 'string') return false;
  const s = expr.replace(/\*$/, '').trim();
  const split = (str, op) => { let depth = 0; const parts = []; let cur = ''; const toks = str.split(/(\(|\)|\s+)/).filter(t => t && !/^\s+$/.test(t));
    for (const t of toks) { if (t === '(') depth++; if (t === ')') depth--; if (depth === 0 && t.toUpperCase() === op) { parts.push(cur.trim()); cur = ''; } else cur += (cur && t !== ')' && !cur.endsWith('(') ? ' ' : '') + t; }
    parts.push(cur.trim()); return parts; };
  const strip = x => { x = x.trim(); while (x.startsWith('(') && x.endsWith(')')) x = x.slice(1, -1).trim(); return x; };
  const ev = x => { x = strip(x); const or = split(x, 'OR'); if (or.length > 1) return or.some(ev); const and = split(x, 'AND'); if (and.length > 1) return and.every(ev); return list.includes(x.replace(/\s+WITH\s+.*$/i, '')); };
  return ev(s.replace(/\//g, ' OR '));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const j = JSON.parse(execFileSync('npx', ['license-checker', '--production', '--json', '--excludePackages', 'app@0.0.0'], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  const bad = Object.entries(j).filter(([, v]) => !allowed(Array.isArray(v.licenses) ? v.licenses.join(' AND ') : v.licenses)).map(([k, v]) => `${k}: ${v.licenses}`);
  if (bad.length) { console.error('Not allowed in the web bundle:\n' + bad.join('\n')); process.exit(1); }
  console.log(`license gate: ${Object.keys(j).length} packages, all allowed`);
}
