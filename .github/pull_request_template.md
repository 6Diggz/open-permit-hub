## What changed

## Rule changes (skip if none)
- [ ] Every new or changed rule cites a source with a link, and the edition when it is a code section
- [ ] Unverified citations are marked `verified: false`
- [ ] A pass test and a fail test in `app/src/test`
- [ ] Spanish text added (`app/src/ui/es.ts`, `app/src/rules/cites-es.ts`)
- [ ] `PACK.version` / `verifiedOn` bumped in `app/src/rules/pack.ts` and a line in `CHANGELOG.md`

## Checks
- [ ] `npx vitest run`, `npm run build`, `npx oxlint` (app), `cargo test` (clean), `npm test` (mcp), `node e2e/e2e.mjs` (app)
