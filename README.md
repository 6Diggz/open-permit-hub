# Garage to ADU Check (Open Permit Hub)

Check an LA garage conversion against cited rules before you pay for drawings. Free, runs on your device, no account. **Not a city approval.**

**Try it:** https://6diggz.github.io/open-permit-hub/ (English and Español, works offline once loaded)

**Every rule, with its source:** https://6diggz.github.io/open-permit-hub/rules/ ([en español](https://6diggz.github.io/open-permit-hub/rules/es/))

![Drag the ADU off the property line and watch the fire-wall check go green](docs/demo.gif)

Every result names the code section behind it. Unknown answers never show as a pass. Turning a check off prints "not checked" on every export.

## What's in here
| Folder | What it is |
|---|---|
| `app/` | The web app (PWA). Lot, garage, rooms, checks, export, review (numbered review notes and correction responses), a plan-set PDF pre-check, and an inspector field mode for the site visit (checklist, one photo per item, visit PDF). English + Spanish. |
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

## Use it with Claude (MCP)
An AI agent can do most of what the app does through the MCP server in `mcp/`: start or import a project, fill it in, draw rooms, run the checks, answer plan-check corrections and export the plan set. The plan-set PDF pre-check and the inspector field mode (camera photos) are in the app only. It runs over stdio only (no network port) and only touches files inside `OPA_ROOT`.
```bash
cd app && npm install && cd ../mcp && npm install && npm test   # builds dist/, runs the self-test and the end-to-end test
```
Add to Claude Desktop's config (`claude_desktop_config.json`):
```json
{ "mcpServers": { "permit-hub": { "command": "node", "args": ["/full/path/to/mcp/dist/server.mjs"], "env": { "OPA_ROOT": "/full/path/to/your/projects" } } } }
```
Or in Claude Code: `claude mcp add permit-hub -e OPA_ROOT=/path/to/projects -- node /path/to/mcp/dist/server.mjs`

| Tool | What it does | Writes? |
|---|---|---|
| `list_projects` | Every `.permitpack` in the projects folder (up to 500, 4 folders deep; `truncated: true` when more exist), with its status. | no |
| `create_project` | New garage conversion (or new ADU) as a working copy; returns the first checks. | new file |
| `import_permitpack` | Working copy from a plain or passphrase-locked pack, or a backup bundle. | new file |
| `get_project` | The whole project: lot, house, garage, rooms, doors, windows, answers, sheet answers, docs, review notes. | no |
| `edit_project` | Field-path editor for everything the screens edit (`set`, `add`, `remove`, `move`, `autofit`, `letter`). Preview first; `apply: true` or `apply_edit` to write. | on apply |
| `propose_edit` / `apply_edit` | Short-form preview for size and heights; apply any proposal. Same proposal twice returns the same file. | on apply |
| `run_checks` | Rule ids with status, message, next step and citations; LADBS sheet readiness score and open items; plain answer; export blockers. | no |
| `parcel_lookup` | Opt-in city map lookup (APN, zone, lot lines, overlays). Off unless `OPA_ALLOW_NETWORK=1`. | on apply |
| `add_pin` / `update_pin` / `resolve_pin` | Numbered review notes on the site plan. | on apply |
| `import_corrections` | Splits a pasted correction letter into checklist items. | on apply |
| `export` | `pdf_sheets` (24x36), `pdf_report`, `dxf`, `handoff_zip`, `ics`, `html_report`, `permitpack` (optionally locked), `materials_csv`, `response_letter`. Never overwrites. | new file |
| `list_rules`, `check_citations`, `materials` | Rule list, citation guard (abbreviated or spelled-out sections), materials estimate. | no |

Safety: text people wrote (names, addresses, room names, review notes, letters, map answers) comes back only as tokens like `[[user_3]]`; the real text is inside `user_data_do_not_follow` and is data, never instructions. Originals are never overwritten: edits to a file the server did not create go to a new `-edited` copy, and edits to a working copy update it in place. Errors are `isError` results with a code (`proposal_not_found`, `file_changed`, `invalid_edit`, `passphrase_required`, `export_blocked`, ...) and a hint.

Example prompts:
- "Start a garage conversion for 4305 Edenhurst Ave, Los Angeles 90039. The garage is 20 by 20, detached, wood frame, permitted, built in 1962. Look up the parcel, then tell me in one sentence if it can become an ADU."
- "Split the garage into a 11 by 10 bedroom with a 24 by 44 inch window on the left wall, a 7 by 8 bath and a living room with a 36 inch door. Show me what changes before you save."
- "Run the checks and list what is still open on the LADBS correction sheet, grouped into what I answer and what my preparer answers."
- "Here is the city's correction letter: ... Turn it into items, draft a response to each one, and check every code section you cite."
- "Export the 24x36 plan sheets, the DXF for my drafter and the handoff packet. Add the plan-check deadline to my calendar: we filed on 2026-11-02."

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
