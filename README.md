# Garage to ADU Check (Open Permit Hub)

Check an LA garage conversion against cited rules before you pay for drawings. Free, runs on your device, no account. **Not a city approval.**

**Try it:** https://6diggz.github.io/open-permit-hub/ (English and Español, works offline once loaded)

![Drag the ADU off the property line and watch the fire-wall check go green](docs/demo.gif)

Every result names the code section behind it. Unknown answers never show as a pass. Turning a check off prints "not checked" on every export.

## What's in here
| Folder | What it is |
|---|---|
| `app/` | The web app (PWA). Lot, garage, rooms, checks, export. English + Spanish. |
| `app/src/rules/la-city.ts` | The LA City rule pack. Every rule cites its source and says if the citation is verified. |
| `mcp/` | Connects Claude (Desktop or Code) to your project files. Preview-then-apply edits, never overwrites. |
| `clean/` | "Clean and Fix" for daily CAD users: inspect any DWG/DXF and write a clean copy. Rust, runs in the browser as WASM. |
| `docs/` | Attorney packet, license notes, roadmap. |

## Run it
```bash
cd app && npm install && npm run dev        # open the printed URL
npx vitest run                               # rule + export tests
npm run build && node e2e/e2e.mjs           # browser tests (phone + desktop, offline, accessibility)
```

## Use it with Claude
```bash
cd mcp && npm install && npm test        # builds dist/server.mjs and runs the self-test
```
Add to Claude Desktop's config (`claude_desktop_config.json`):
```json
{ "mcpServers": { "permit-hub": { "command": "node", "args": ["/full/path/to/mcp/dist/server.mjs"], "env": { "OPA_ROOT": "/full/path/to/your/projects" } } } }
```
Or in Claude Code: `claude mcp add permit-hub -e OPA_ROOT=/path/to/projects -- node /path/to/mcp/dist/server.mjs`

Tools: `run_checks`, `list_rules`, `propose_edit`, `apply_edit`, `materials`, `check_citations`.

## What it does not do
- It does not approve plans or make a submittal-ready set. A human preparer finalizes the handoff packet.
- It does not do structural or Title 24 energy design. It tells you when you need those pros.
- Only LA City in this version.

## Docs
- `CHANGELOG.md`, `GOVERNANCE.md`, `SECURITY.md`, `ACCESSIBILITY.md`
- `docs/JURISDICTION_PACKS.md` (adding cities), `docs/DWG_FIDELITY.md` (Clean and Fix limits), `docs/PRIVACY_NOTES.md`
- Pending decisions: `docs/TERMS_PENDING_ATTORNEY_REVIEW.md`, `docs/TRADEMARK_PENDING.md`

## Hosting
The site is static files on GitHub Pages (free; fits today's size and traffic). GitHub Pages is not meant for a commercial SaaS: before any paid tier, move hosting (for example to Cloudflare Pages) and keep the bundle budget check in CI.

## License
Our code: Apache-2.0. `acadrust` (used unmodified by `clean/`): MPL-2.0. See `docs/LICENSES.md`.
