# Garage to ADU Check (Open Permit Hub)

Check an LA garage conversion against cited rules before you pay for drawings. Free, runs on your device, no account. **Not a city approval.**

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
```

## Use it with Claude
```bash
cd mcp && npm install && npx esbuild src/server.ts --bundle --platform=node --format=esm --outfile=dist/server.mjs
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

## License
Our code: Apache-2.0. `acadrust` (used unmodified by `clean/`): MPL-2.0. See `docs/LICENSES.md`.
