// lead-04: THIRD_PARTY_NOTICES must carry each Rust crate's own license text, not a one-line summary
// (app/scripts/notices.mjs used to overwrite the file without them).
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
it('notices keep the crate license texts', () => {
  const n = readFileSync(`${__dirname}/../../../public/THIRD_PARTY_NOTICES.txt`, 'utf8');
  const i = n.indexOf('== Rust crates compiled into cleanfix_bg.wasm ==');
  expect(i).toBeGreaterThan(0);
  const crates = n.slice(i);
  expect(crates).toMatch(/Source: https:\/\/crates\.io\/crates\//);
  expect(crates).toMatch(/Permission is hereby granted, free of charge/); // MIT text itself, from a crate's LICENSE file
  expect(n.match(/== Rust crates/g)?.length).toBe(1);
});
