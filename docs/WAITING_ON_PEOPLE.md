# Things waiting on people (prepped, not blocking)
| Item | Who | What's ready | Unlocks |
|---|---|---|---|
| Legal review | CA attorney | docs/ATTORNEY_PACKET.md | Public launch, paid tiers, reviewer directory |
| Firm plan licenses | Each LA Standard Plan design firm | Link-out now; outreach email can be drafted | Auto-fit of firm plans (YOU-ADU works now) |
| Golden permits | A requester for a CPRA request to LADBS (20 correction letters), partner drafters | Plan, sources, scoring and interim benchmark: docs/BENCHMARK.md; test harness in app/src/test | Launch gate PR30 |
| Search engines find the rule pages | Diggz (login) | Sitemap at /open-permit-hub/sitemap.xml, linked from every page head. robots.txt only works at a host root, which a github.io project subpath can't have | Submit the sitemap in Google Search Console and Bing Webmaster Tools, or buy a domain (then robots.txt moves to the root) |
| Repo listing | Diggz (login) | Suggested: homepage https://6diggz.github.io/open-permit-hub/, topics adu, permits, los-angeles, dxf, dwg, mcp; a v0.2.0 Release from CHANGELOG.md | Set in GitHub repo settings (the session token can't) |
| First real permit | A beta owner | Handoff packet export | "Permits approved" wording |
| Second maintainer | Volunteer / hire | Branch protection plan | 2-reviewer rule packs |
| Code signing / domain / LLC | Diggz (money) | - | Signed releases, hosted demo |

## LA County (unincorporated) beta pack: needs a human reviewer (OUT-15)
The pack (`app/src/rules/la-county.ts`, `county-pack.ts`) is opt-in, never says "Likely yes", and cannot export until each line below is done by a person.

| Item | Who | What's ready | Unlocks |
|---|---|---|---|
| Rule-by-rule review of 28 County rules | Someone who knows LA County DPW Building and Safety plan check (second maintainer for the pack) | Every rule cites its source, edition and the 2026-10-25 open date; 22 hand-derived golden cases in `qa/golden/county.test.ts` | Remove the beta flag |
| Golden cases from real County permits | A requester for a public-records request to LA County DPW (issued garage-conversion permits with correction lists) | Case format and harness in `qa/golden/county.test.ts` | "Likely yes" for County lots |
| Is the ADU Checklist V4.2 still in use? | DPW counter or email (it prints "Updated: 8/6/2019") | Catalog in `county-pack.ts`; 2023 LACBC cited by the Standard Notes | Trust in the checklist score |
| Standard Notes conflict on HVAC distance | DPW / Regional Planning | Notes say equipment "may not be installed within 2 1/2 feet" (DRP part) and "may be within 2 1/2 feet" with DRP approval (Architectural Notes); the app only shows a note | A real HVAC check |
| Hydrant rule wording | LACoFD | Standard Notes say hydrant "less than 450 feet"; ADU Guidelines v4.1 say "shall not be within 450 feet" (likely a typo). The app uses "less than 450 ft" | Confirm the number |
| Whether County still enforces the HCD-flagged parts of Ord. 2025-0029 | DRP / HCD (letter of 12/1/2025, County reply due 12/31/2025) | CHCD-01 note says the app uses state law there | Turn the note into checks |
| 2026 ADU ordinance amendment (DRP draft guides of 5/4/2026) | DRP | Not modeled: the guides say they are "not currently active regulations" | Update the pack when adopted |
| Source hashes for `docs/sources.lock.json` | Diggz or a maintainer with a normal browser | DPW PDFs and leginfo returned 403 to scripted download (bot check); text was read through a fetch tool only | Weekly rules-watch for County sources |
| MCP server, PDF and handoff packet | Engineering (no person needed, next chunk) | Still LA City only; County export is blocked on purpose | County export |
