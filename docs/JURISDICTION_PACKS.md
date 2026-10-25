# Jurisdiction packs (design)

Today one pack exists: LA City (`app/src/rules/la-city.ts`, metadata in `app/src/rules/pack.ts`). Lots outside LA City get **NOT_SUPPORTED** and export is blocked. This is the design for adding more.

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

## Rules for every pack
1. Every rule cites a source and an edition; unverified cites are labeled in the UI and exports.
2. Unknown never shows as PASS; health-and-safety items can't be dismissed.
3. Each rule has a pass test and a fail test; each pack has golden projects (see `WAITING_ON_PEOPLE.md`).
4. Spanish for every user-facing string, checked by test.

## Order
1. Split the state rules out of `la-city.ts` into `state-ca.ts` (no behavior change; tests prove it).
2. LA County unincorporated (largest "Los Angeles" mailing-address confusion).
3. Long Beach (IB-013 preparer rules), Pasadena, then San Diego.

Status: design only. Building a second pack needs a maintainer who knows that city's plan check.
