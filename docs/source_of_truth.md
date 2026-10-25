# Source of Truth - Open ADU Permit Hub (pass 4, integ4, 2026-10-24)
This file wins over context.md, mvp_line.md and any fix text when they disagree (PR27). Change it only by PR with a change-log line.

## 1. One MVP definition
"A free, local-first web app (PWA) for LA City detached garage conversions (<= existing footprint, no addition) and LA pre-approved ADU site fit (City-owned YOU-ADU plans only; firm plans = link-out, PR42). It checks the lot and design against cited, versioned rules and outputs a bilingual check report, DRAFT sheets, a clean handoff packet, and a city pre-check PDF."
- Jurisdiction: LA City only (UU1281). LA County = L2 (trigger in mvp_line).
- Scope table (UU1282): detached garage conversion, no new area; pre-approved plan site fit, YOU-ADU only, plan count read live never hard-coded (UU1456/PR42) (footprint + setbacks from plan-sheet metadata, UU1278). Attached garage, additions >150 sf (UU1384), JADU, legalization (UU1385) = L2.
- Inputs: manual tape entry (always free), RoomPlan USDZ / Polycam GLTF file import (UU1280, UU1383). No native app.
- No server holding user data. No sync. No payments (UU1415 payments module = L2+, off, provider-neutral Stripe/Square/QBO links, PR47/PR53). No accounts. No hosted share links: share = encrypted .permitpack file (PR50). Backup: auto only on desktop Chromium; iOS = reminder + one-tap export (PR48). ToS: English binds + Spanish courtesy copy pending attorney (PR49). Module off = 'NOT CHECKED', status Incomplete (PR51). No GPL in bundle; LGPL as swappable WASM; CC0 hatches only (PR52).
- Clocks: permit expiry 98.0602, plan check 98.0603, each with own citation (PR44). Sprinklers only if primary sprinklered; LAFD access is a separate card (PR45). Licence: ADR-0001 records acadrust as single MPL-2.0 (PR43/PR54). CCPA thresholds live in legal config (PR46).
- Built-in from shadow review (cheap, MVP-critical): undo stack (UU1237), title block auto-fill (UU1245), true-size print packet + scale bar (UU1246, UU1340), guided mode (UU1260), demo parcel (UU1268), encrypted backup to user's own drive (UU1269), .ics deadlines (UU1261), address/map-link intake (UU1254), design system (UU1247), module manifest (UU1251).
- Everything else in UU1238-UU1275 and UU1312-UU1368 is Layer 2 or later (section 5).

## 2. What an MVP user can submit (resolves UU1276 vs PR04 vs mvp_line L2 export)
The MVP has NO submittal-ready export. That stays L2.
| Output | Watermark | Who uses it | City-facing? |
|---|---|---|---|
| Check report | none; header "Software check, not a city review" | owner (EN+ES) | no |
| Draft sheets PDF | diagonal "DRAFT - NOT FOR SUBMITTAL" (PR04) | owner, family | no |
| Handoff packet (DXF + PDF + check report + red cards) | title-block note only, no diagonal | the preparer of record (owner in own tool, or a drafter) | becomes city-facing only after a human preparer finalizes it |
| City pre-check PDF (UU1389) | margin note "Pre-check copy - not a submittal" (PR28) | owner uploads to LADBS AI pre-check themselves | yes, pre-check only |
So the honest sentence: "In the MVP you submit plans that a human preparer (you or your drafter) finalizes from our handoff packet. For a pre-approved ADU you submit the city's own plan set plus that finalized site plan."
Beta permits (wk12-26) go only through this path. This breaks the loop where L2 export needed a beta approval that needed L2 export (PR29).

## 3. One success metric (MVP, by week 26)
- North star: verified (opt-in, permit number) LA City applications that used the handoff packet and reached plan check. Target >= 20 (matches UU1292 kill line: < 20 = pivot review).
- Proof bar: >= 1 permit issued (only then may copy say "permits approved", PR11).
- Guardrail (must hold or launch rolls back): 0 critical false-greens in the golden suite and in field reports; golden gate per PR30.
- Not metrics: stars, downloads (tracked, never a goal).

## 4. Golden suite numbers (resolves PR21 20 vs UU1284 50 vs UU369 100)
See PR30: 20 anonymized permits = MVP launch gate; 50 = L2 submittal export and LA County unlock; 100 = long-term target.

## 5. Layer 2 (pro daily-CAD hub) - its own MVP
Rule: Layer 2 starts its build only after ADU MVP launch; ADU MVP code may add hooks (module manifest, units abstraction UU1253, CRS field UU1312) but no L2 UI (UU1294).
- L2 MVP definition: "Clean and Fix" - open any .dwg/.dxf, never touch the original, write a clean copy (UU1308) with: report of fonts substituted (UU1333), broken xrefs found + relative-path repair (UU1272), purge/audit, units confirmed (UU1033), CNC DXF profile (UU1325, UU1394: R12/R14/2000/2018). Plus PDF underlay + measure + markup list (UU1258, UU1259) and AutoCAD command aliases (UU1239/UU1328).
- L2 MVP user: drafter or CNC shop owner who has a messy file today.
- L2 success metric: 50 real outside files cleaned with 0 data loss in the round-trip fidelity suite (UU1331), and 10 repeat weekly users (opt-in).
- L2 unlock trigger: ADU MVP launched + fidelity suite publishes a score per feature.
- Later in L2+: layers/layouts/OSNAP full parity (UU1238-1244), CTB/STB (UU1271), LISP/CUI (UU1334-1336), CRS/datum (UU1312-1315), IFC/DGN/GeoPackage (UU1343-1348), international packs (UU1349-1359), trade modules (UU1360-1367), classroom (UU1275, UU1322-1324), ITAR mode (UU1405 per PR32).

## Change log
- p6 integ6: fix-rerun of 78 p5 fixes; PR48-PR53 (iOS backup, ToS language, share-as-file, module-off merge UU1543->UU1507, licence table, payment adapter). 1 new finding UU1544.
- p5 integ5: fix-rerun of 60 p4 fixes; PR42-PR47 added (YOU-ADU only, licence election, clock citations, sprinkler vs LAFD access, CCPA config, payments module layer).
- p4 integ4: created; one MVP, submit path, metric, golden numbers, L2 MVP. Rules PR27-PR41 added.
- p7 close7: ripple of 9 verify6 corrections -> PR54 (LARR->ESR, Mello exemption step, AB 2533 date branch, MPL single, ISO 7200 fields, SB 9 EOs, 98.0605 verify, County 106.4.1.1/106.5.4, methane no exempt default); PR33/PR43 text amended. 0 new findings.
