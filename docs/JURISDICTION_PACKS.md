# Jurisdiction packs (design)

Two packs exist. LA City (`app/src/rules/la-city.ts`, metadata in `app/src/rules/pack.ts`) is the main pack. LA County unincorporated (`app/src/rules/la-county.ts`, metadata and checklist in `app/src/rules/county-pack.ts`) is a **beta** behind the "Beta: LA County (unincorporated)" opt-in on the Lot step. Other lots get **NOT_SUPPORTED** and export is blocked.

## The seam (how the app picks a pack)
- `app/src/rules/registry.ts`: `packFor(jurisdiction, { beta })` returns a pack or null. Beta packs need the user's opt-in. `packForProject(p)` routes by `p.site.jurisdiction` (parcel lookup already returns `la-county` for unincorporated parcels) and falls back to LA City, whose JUR-01 gives an honest NOT_SUPPORTED. `packById(id)` finds the pack a report was made with.
- The UI (`ui/App.tsx`), the shared verdict (`core/verdict.ts`) and readiness (`rules/readiness.ts`) load rules, the checklist catalog and rule-to-item links through the registry.
- Pack-declared inputs (r4juris-07): County-only answers live in `p.site.county` (LACoFD Form 195/196 fire flow, hydrant distance, access distance, road width and grade, path width and grade, fault zone), typed and range-checked in `core/permitpack.ts`.
- Beta packs: plain answer is capped at "Maybe", export is blocked, the score names the pack's own checklist.

## LA County beta pack: sources (each opened 2026-10-25)
| Source | Edition printed |
|---|---|
| [DPW Expedited ADU Checklist V4.2](https://pw.lacounty.gov/bsd/lib/fp/Building/Residential/Accessory%20Dwelling%20Units/ADU%20Checklist.V4.2.pdf) | Updated 8/6/2019 |
| [DPW Garage Conversion to ADU & JADU Standard Notes and Details](https://pw.lacounty.gov/bsd/lib/fp/Building/Residential/Accessory%20Dwelling%20Units/Garage%20Conversion%20to%20ADU%20%26%20JADU%20Standard%20Notes%20and%20Details.pdf) | Rev. 01/06/2023, 03/20/23; cites 2023 LACBC |
| [DPW Homeowner Guide to Garage Conversion to ADU & JADU](https://pw.lacounty.gov/bsd/lib/fp/Building/Residential/Accessory%20Dwelling%20Units/Homeowner%20Guide%20to%20Garage%20Conversion%20to%20ADU%20%26%20JADU.pdf) | No date printed |
| [DPW ADU Guidelines (LACoFD requirements, FAQ)](https://pw.lacounty.gov/bsd/lib/fp/Building/Residential/Accessory%20Dwelling%20Units/ADU%20Guidelines.pdf) | v4.1, 10/10/2024 |
| [DRP memo on Title 22 §22.140.640, Ord. 2025-0029](https://planning.lacounty.gov/wp-content/uploads/2025/08/ADU_Ordinance_Amendment.pdf) | Adopted 7/29/2025, effective 8/28/2025 (memo 8/21/2025) |
| [HCD findings letter to LA County](https://www.hcd.ca.gov/sites/default/files/docs/policy-and-research/ordinance-review-letters/los-angeles-county-adu-findings-120125.pdf) | 12/1/2025 |
| Gov. Code §66314, §66323 (leginfo) | Text current as of 1/1/2026 |

28 rules (26 County rules plus GEO-01 and INP-01 reused from LA City). Fire access numbers sit in `COUNTY_PARAMS`. What still needs a person: `docs/WAITING_ON_PEOPLE.md`.

This is the design for adding more.

## A pack is
| Part | What | Where it lives |
|---|---|---|
| Identity | `id` (`la-city`), `version`, `effectiveFrom`, `verifiedOn`, `reviewBy` | `pack.ts` style record |
| Boundary | How a parcel is matched: parcel service query or boundary file, plus a list of mailing-city names that are NOT this jurisdiction | pack folder |
| Base | The state pack it inherits (Gov. Code §66314 and following: setbacks, height, parking, fees) | `rules/state-ca.ts` (to split out of `la-city.ts`) |
| Overrides | Local rules that replace or add to state rules (fire sprinkler triggers, objective design standards, who may prepare plans) | pack rules file |
| Correction sheet | The city's own checklist as a catalog (like `ladbs-adu-2025.ts`) with rule-to-item links | pack folder |
| Sources | URLs + SHA-256 of each source document | `docs/sources.lock.json` (watched weekly by `rules-watch.yml`) |
| Maintainers | At least one named reviewer per pack; two for rule changes | `CODEOWNERS` |

## Axes a pack must model (neighbors differ on each)
A city name is not enough. One parcel answers to several authorities, and they change independently:

| Axis | Examples in LA County | Why it matters |
|---|---|---|
| Boundary | Parcel geometry from the County GIS parcel layer (not mailing-city names) | "Los Angeles, CA" addresses include unincorporated county areas and other cities |
| Building authority | LADBS, LA County Public Works (Title 26), Long Beach, Pasadena, Glendale | Correction sheet, preparer rules (Long Beach information bulletins), plan-check forms |
| Zoning authority | LA City Planning (LAMC), LA County Regional Planning (Title 22) | Setback, height and design standards; hillside and overlay rules |
| Fire authority | LAFD, LA County Fire (LACoFD), city fire departments | Hose pull limits, sprinkler triggers, fire-zone (VHFHSZ) rules |
| Utility | LADWP, SCE, local water districts | Panel and meter rules, easement approvals (LADBS sheet I-B.8 is LADWP-only) |
| Overlays and emergency orders | Coastal zone, HPOZ, methane zone, 2025 burn areas (Altadena, Palisades) | Each can add steps or suspend automatic passes |

Each axis is its own small module the pack composes. A rule names the axis it belongs to, so a parcel in Altadena gets the County building and zoning rules, LACoFD fire rules, SCE utility rules and the Eaton rebuild orders, without copying LA City rules.

## Rules for every pack
1. Every rule cites a source and an edition; unverified cites are labeled in the UI and exports.
2. Unknown never shows as PASS; health-and-safety items can't be dismissed.
3. Each rule has a pass test and a fail test; each pack has golden projects (see `WAITING_ON_PEOPLE.md`).
4. Spanish for every user-facing string, checked by test.
5. A pack may declare a "conflicts with state law" status for a local rule that HCD (or a court) found out of line; the check then uses the state rule and cites the finding.

## Order
1. Split the state rules out of `la-city.ts` into `state-ca.ts` (no behavior change; tests prove it).
2. Long Beach first: it has no local ADU ordinance, so its pack is the state base plus Long Beach building and fire review, the Coastal (Admin LCDP) and historic (COA) steps, and the IB-PZ-001 numbers (rear 4 ft measured to the alley centerline, Parking Exempt Area 21.41.175, car share). Its rules are close to `state-ca.ts`, so it is the smallest second pack.
3. LA County unincorporated second (largest "Los Angeles" mailing-address confusion). HCD's letter of Dec 1, 2025 (`los-angeles-county-adu-findings-120125.pdf`) found County ordinance 2025-0029 out of line with state law on front-setback siting (22.140.640 G.1.c.i, G.1.f.7.a), attached ADU height (G.1.b.iii; state law allows 25 ft, Gov. Code §66321(b)(4)(D)), unit counts (Table 22.140.640-A) and subjective "character-defining features" (G.1.f.2.i). Where HCD found a conflict, the County pack applies state law, cites the HCD letter, and marks the rule with a "conflicts with state law" status instead of the County number.
4. Pasadena, then San Diego.

Status: LA County beta built (OUT-15); the state-rules split (step 1) and Long Beach are not done yet. Each pack still needs a maintainer who knows that jurisdiction's plan check before its beta flag comes off.
