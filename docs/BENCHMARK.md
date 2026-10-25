# Benchmark plan: does the check catch what plan check catches?

The question is simple: for real LA City garage conversions, how many of the corrections a plan checker actually wrote would this app have flagged first? This file says where the test cases come from, what is scored, and what we publish.

## Where the cases come from
| Source | What we get | How | Status |
|---|---|---|---|
| LADBS Standard Plan Program | Approved ADU plan sets that are public | Download from dbs.lacity.gov/standard-plan-program | Can start now (no request needed) |
| California Public Records Act request to LADBS | 20 garage-conversion correction letters (PC/STR/Corr.Lst.20A) with the plan sets, 2025-2026 | Written CPRA request; LADBS has 10 days to respond | Needs a requester's name (see WAITING_ON_PEOPLE.md) |
| Partner drafters | Their own past correction letters, names removed | Drafter shares with written consent | Needs partners |

Personal data (owner names, addresses, APNs) is removed before any case enters the repo. A case is stored as a `.permitpack` plus a list of the correction-sheet item IDs the plan checker marked.

## What is scored
- **Recall**: of the sheet items the plan checker marked, the share the app marked as Fix or Need info.
- **False alarms**: items the app marked Fix that the plan checker did not mark (reviewed by hand; some are real misses by plan check).
- **Safety recall** separately: health-and-safety items (fire separation, escape windows, alarms, structure). Target: no missed safety item.

## Interim benchmark (before real letters arrive)
1. Standard Plan sets as "known good" projects: entered by hand, they should come out READY (or only ask for answers the plans don't show).
2. The seeded projects in `app/src/test/r1.test.ts` and `app/src/test/r2.test.ts` (one per known failure mode) stay as regression cases.

## Published result
Each rule pack version (`PACK.version`) gets one line in CHANGELOG.md: cases, recall, safety recall, false alarms. A pack whose safety recall drops does not ship.
