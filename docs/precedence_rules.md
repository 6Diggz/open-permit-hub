# Precedence Rules - Open ADU Permit Hub (pass 2, integrate)

When two fixes disagree, the rule below wins. Tie-break order: 1 Law/licensure > 2 Safety > 3 Privacy > 4 Truthful claims > 5 Zero-effort/UX > 6 Cost/speed.

## PR01 (sev 5)
Conflict: Hard-stop gates (UU473 slope/hillside, UU097, UU351, UU311 unknown blocks export, UU360, UU519) collide with zero-effort/60s value (UU498, UU227) and the owner's legal right to prepare their own plans

Rule: PRECEDENCE: Gates block only the SUBMITTAL-READY export and auto-fit of pre-approved plans. Draft export, consultant handoff packet (with the red 'engineer required' card printed on cover) and 60s preview are never blocked. Safety > zero-effort, but a gate must always offer a next step (directory, checklist), never a dead end

## PR02 (sev 4)
Conflict: Fire-rebuild module (UU596, UU401) targets parcels that the hillside/VHFHSZ hard gate (UU473, UU593) auto-refuses

Rule: PRECEDENCE: Fire-rebuild rule pack is evaluated BEFORE the hillside gate; when an EO applies, gate downgrades to 'engineer required' card while still allowing like-for-like rebuild path; EO-specific restrictions (e.g. state limits in Palisades) override both

## PR03 (sev 4)
Conflict: Unknown-blocks-export (UU311) contradicts 'not checked: easements, sewer lateral' disclosure on green results (UU170) and 'easements unknown' (UU423)

Rule: PRECEDENCE: Two unknown classes. RULE-unknown (a required code check could not run) = blocks submittal export. DATA-gap the city does not check at plan review (title easements, CC&Rs) = disclosed on cover, never blocks

## PR04 (sev 5)
Conflict: Four different watermark/disclaimer fixes: 'Not a permit. Not reviewed by LADBS' every sheet (UU482), 'NOT FOR SUBMITTAL - demo' (UU200), 'owner-prepared - not a permit' until permit # verified (UU390), disclaimer in title block (UU572)

Rule: PRECEDENCE: Draft state = diagonal 'DRAFT - NOT FOR SUBMITTAL'. Submittal state (all gates passed + attest) = NO overlay watermark; one fixed title-block note 'Owner-prepared with software; not reviewed or approved by any agency'. Post-permit: note stays, city stamp governs. One wording, defined in a single copy file

## PR05 (sev 4)
Conflict: Spanish-first UI (UU122, UU582, UU600) vs English-only exported sheets/letters (UU123, UU520) vs owner signing attestations, owner-builder quiz and clickwrap ToS (UU090, UU572)

Rule: PRECEDENCE: City-facing artifacts (sheets, response letter) = English only. User-facing legal (ToS, owner-builder disclosure, attestations) = shown in user's language with English side-by-side; English controls and that is stated in both languages; quiz answered in user's language. Translation reviewed by paid native reviewer before legal text ships

## PR06 (sev 4)
Conflict: Local-first / no geometry analytics (UU020, UU060, UU125) vs publishing approval rate with denominator (UU353), approval-rate tracking (UU235), throttle if first-submit fail >50% (UU495), community correction confidence (UU303)

Rule: PRECEDENCE: Privacy wins. All quality metrics come only from opt-in outcome reports (UU392) verified by permit number; every published stat labeled 'n opt-in reports', never 'approval rate'. Throttle trigger uses opt-in sample with min n=20

## PR07 (sev 3)
Conflict: Local-first vs incident outreach to affected projects (UU624) and signed advisory feed fetched on open (UU625 opt-out) and hosted duplicate-APN warning (UU538)

Rule: PRECEDENCE: Advisory feed is a pull of a public signed file; matching against project rule-pack versions happens on-device only; no project data sent. Outreach = in-app banner + public changelog, email only for users who opted in. Duplicate-APN check only in hosted tier with consent

## PR08 (sev 5)
Conflict: Governance fixes require 2 reviewers on rules (UU027,UU076,UU137,UU487,UU577), 2-person release approval (UU564), DCO + signed commits (UU487,UU557), 2FA, CODEOWNERS, for a solo non-technical founder plus Claude

Rule: PRECEDENCE: Phase 0 (until 2nd human maintainer): required check = CI + Diggz one-click approval of Claude-opened PRs (Claude works on a bot account, Diggz approves, so author != approver). DCO Signed-off-by only by humans; Claude adds 'Assisted-by' trailer. Signed commits via web-flow/gitsign, no GPG chores. '2 reviewers' and '2-person release' activate automatically when GOVERNANCE lists 2 humans; until then rules ship with 'unverified' badge

## PR09 (sev 4)
Conflict: Pinned rule pack per project (UU039, UU316, UU620) vs refuse export if pack older than latest statute (UU100), expiry/kill switch 12 months (UU212, UU332), dead-man amber after 120 days (UU494), 6-month warning (UU619), fire EO weekly (UU596)

Rule: PRECEDENCE: Staleness is measured against the project's application/deemed-complete date, not today. Pinned pack valid for its date window never expires for that project. Unified clock: data fetch >30 days = refresh prompt; rule pack with no maintainer sign-off >120 days = amber; >12 months = 'unmaintained' banner; EO-tagged packs = 7 days. One config file holds all numbers

## PR10 (sev 4)
Conflict: Conflicting license choices: Apache-2.0 vs AGPL core (UU081, UU082, UU335), MPL core (UU557), Apache app (UU544); rule data CC-BY-4.0 (UU329, UU330) vs CC BY-SA/ODbL (UU486) vs CC0

Rule: PRECEDENCE: Decided once in ADR-0001 before first commit: MPL-2.0 for forked acadrust/cadcraft files, Apache-2.0 for new crates, CC-BY-4.0 for rule data and Permit Pack spec. AGPL/SA options rejected. No relicense planned (UU557 wins)

## PR11 (sev 2)
Conflict: Banned word 'approved' (UU228, UU353) vs features named 'Approved pack locked' (UU525), 'I got approved' (UU392), 'Verified (approved permits)' tier (UU543), approval playbook (UU222)

Rule: PRECEDENCE: 'approved/permit' allowed only when it refers to an agency act and is tied to a verified permit number; never for tool output. Copy CI allowlist with context tag

## PR12 (sev 4)
Conflict: 'AI never authors compliance results' (UU035) vs AI extracting correction comments to tasks (UU190), AI flagging 'unreasonable' CC&R terms (UU422), AI in-language support answers (UU127), AI rule explanations

Rule: PRECEDENCE: AI may extract, translate, summarize and draft; it never sets a rule's pass/fail/unknown state and never says a term is legal/illegal - only 'matches statute text Civ 4751, ask an attorney'. All AI text carries an 'AI' chip

## PR13 (sev 3)
Conflict: Four different tape-measure policies: 2 per room >2in (UU015, UU321), 3 spot checks >1in (UU092), 1 anchor per room >1% (UU163), 1 wall + ceiling >1% (UU492)

Rule: PRECEDENCE: One policy: per room 1 anchor wall length + ceiling height; plus 1 door width per scan. Fail threshold = larger of 1 in or 1%. Applies to LiDAR; non-LiDAR = full tape wizard

## PR14 (sev 3)
Conflict: Conflicting survey-margin thresholds: within 1 ft (UU491), within 2 ft (UU012, UU536), never auto-pass within 1 in (UU246)

Rule: PRECEDENCE: Parcel-line based checks: margin <2 ft with GIS lines = 'survey recommended'; <6 in = blocking unless survey/deed dims entered. Measured-interior checks: within 1 in = tape verify task

## PR15 (sev 3)
Conflict: Strip textures/EXIF/GPS by default (UU019, UU165, UU380) vs photo proof with timestamp+location+hash for inspections/disputes (UU234), photoreal lot preview/share card (UU499, UU149)

Rule: PRECEDENCE: Inside the local Permit Pack keep originals with metadata (proof). Every export/share path scrubs EXIF/GPS and blurs exterior/people unless user toggles per-file. Share cards use rendered model + aerial, never user photos

## PR16 (sev 3)
Conflict: Release key custody: hardware token key + required reviewer (UU027) vs Sigstore keyless, no central key (UU508, UU564)

Rule: PRECEDENCE: Sigstore keyless (OIDC) for releases and rule packs. Hardware key only where platform demands a cert (Apple notarization, Azure Trusted Signing). User PDF signatures always user's own

## PR17 (sev 3)
Conflict: Entity: separate single-member LLC with own Stripe (UU554) vs Arizona LLC first (UU553) vs 'form LLC' before launch (UU144, UU507); founder's existing Stripe is another product

Rule: PRECEDENCE: One new AZ LLC (founder in Phoenix) for this project only, own EIN/bank/Stripe; never shared with other products. Form before hosted/paid launch or first money, not before OSS repo

## PR18 (sev 3)
Conflict: Spend lines scattered: attorney $2-5k (UU571), E&O $1-3k before launch (UU144, UU354) vs before hosted launch (UU103, UU444), bounty $300 (UU527), trademark early (UU334) vs after traction (UU555), $400 LA trips (UU633), vs 'keep costs near zero' (UU445)

Rule: PRECEDENCE: Spend only by what it unblocks: $0 until core build + one real pre-plan-check consult; attorney memo + E&O before any hosted/paid tier; trademark when launch is near; bounty after beta. Ledger holds the gate per spend

## PR19 (sev 2)
Conflict: Hosted free-tier storage: 2 GB per user (UU569) vs 0 for free users (UU531)

Rule: PRECEDENCE: Free tier stores 0 server-side (local + user's own iCloud/Drive, UU152); 2 GB applies to paid hosted only

## PR20 (sev 3)
Conflict: 'No new city until LA has 25 approved permits' (UU478) vs Phoenix/AZ (UU603, UU454), Austin (UU604), nationwide generic mode (UU386)

Rule: PRECEDENCE: Founder/Claude build only LA City + LA County until the 25-permit gate. Others exist only as community packs with 'community, unverified' badge and no green checks (UU613, UU543)

## PR21 (sev 3)
Conflict: Golden test sets: 20 (UU145), 50 (UU487), 100 (UU369) real approved LA permits, stored in repo as fixtures (UU618)

Rule: PRECEDENCE: Start gate at 20 anonymized fixtures (address removed, geometry shifted to synthetic origin), grow to 100; public repo holds only anonymized. Count lives in one CI config

## PR22 (sev 4)
Conflict: Owner-is-author default (UU349, UU177) vs drafter pro mode / white-label (UU361, UU093, UU528) vs restricting 'prepare for others' (UU434)

Rule: PRECEDENCE: 'Preparer of record' is a required field: owner or named preparer. Owner-prepared label only when owner prepares. 5537 scope gate (UU351) applies to every preparer; licensed stamp block stays empty (UU602)

## PR23 (sev 2)
Conflict: AI-generated label on outputs (UU436, UU533) vs clean sheets and owner as author of record (UU349)

Rule: PRECEDENCE: AI disclosure lives in pack metadata, diff log and cover-sheet software note; not on every sheet. Human preparer reviews and signs

## PR24 (sev 2)
Conflict: No automated upload to ePlanLA (UU627) and owner signs every step (UU634, UU532 tick each item) vs 'zero effort' flow

Rule: PRECEDENCE: Legal/consent acts (sign, attest, upload) stay human by design; product removes all other effort: exact file names, step card with screenshots, checklist auto-ticks (UU501). Zero effort never overrides a consent step

## PR25 (sev 3)
Conflict: Rule PRs need 2 reviewers incl. 'verified local' (UU577) and green only for 'Verified (approved permits)' (UU543) vs weekly fire EO updates (UU596, UU402)

Rule: PRECEDENCE: Emergency-order packs use a fast lane: 1 maintainer + cited EO link, auto-expire at EO end, permanently amber 'emergency rule' badge, never green

## PR26 (sev 2)
Conflict: Trust page shows real approved permits (UU148) and case studies for launch (UU341) vs local-first privacy and permit-number verification revealing address

Rule: PRECEDENCE: Public case studies only with written consent; show district + permit year, not number or address

# Pass 4 additions (integ4, FIX-RERUN of 169 p3 fixes)

## PR27 (sev 4)
Conflict: context.md lists signed permit-set export + LA County as core; mvp_line puts them in L2 (UU1277, UU1281).
Rule: PRECEDENCE: source_of_truth.md wins over context.md, mvp_line.md and fix text. context.md gets a pointer line, not a rewrite (original vision kept as a layer).

## PR28 (sev 4)
Conflict: UU1389 'clean vector PDF for LADBS AI pre-check' vs PR04 diagonal DRAFT watermark on all pre-submittal output, vs PR24 no auto-upload.
Rule: PRECEDENCE: New export profile 'city pre-check'. No diagonal overlay (it breaks the city's AI parsing); fixed margin note 'Pre-check copy - not a submittal'. Owner uploads it themselves (link only). Never claims coverage of structural, energy or MEP. Allowed in MVP.

## PR29 (sev 5)
Conflict: L2 signed export trigger = 'first beta approval', but MVP has no submittal export, so no beta can be approved (circular), and UU1276 says the MVP user 'submits draft sheets'.
Rule: PRECEDENCE: Beta permits go through the handoff packet finalized by a human preparer of record. First issued permit via that path + attorney sign-off unlocks L2 export. Diagonal-draft sheets are never submitted.

## PR30 (sev 4)
Conflict: Golden suite size 20 (PR21, UU145) vs 50 + auditor (UU1284, UU487, UU990) vs 100 (UU369).
Rule: PRECEDENCE: 20 anonymized permits, 100% critical checks match, auditor signs = MVP launch gate. 50 = gate for L2 submittal export and LA County. 100 = target. One CI config holds the numbers.

## PR31 (sev 4)
Conflict: UU1291 'LLC before public launch' vs PR17/PR18 'form before first money, not before OSS repo'; UU1285 adds GitHub Sponsors/grants.
Rule: PRECEDENCE: Turning on any money in (Sponsors, grants, donations, Stripe) is 'first money'. LLC (AZ, PR17) is formed before that switch flips. A launch with no money switch needs no LLC. Launch checklist blocks Sponsors until EIN exists.

## PR32 (sev 4)
Conflict: UU1405 ITAR mode allows E2E sync vs UU1091/UU1320/UU1062 controlled data = local only; MVP has no sync (UU650); UU1405 names FIPS 140-2.
Rule: PRECEDENCE: Controlled/ITAR flag = local-only in MVP and L2 MVP. Encrypted sync for controlled projects exists only in the L4 hosted or self-hosted tier, with a FIPS 140-3 validated module (140-2 certs went historical Sept 2026; re-verify), user-held keys, region pinning. Any cloud AI/MCP call stays blocked either way.

## PR33 (sev 5)
Conflict: Permit clocks - UU940 '180 days no inspection', UU184 'extension up to 180 days, alerts 9/11 mo' vs corrected UU1395 (12 mo no work, 2-yr validity, plan check 18 mo, extension window per 98.0605 - day count UNVERIFIED (sources say 90 vs 30), read from current LAMC text with date).
Rule: PRECEDENCE: UU1395 wins; UU940 and UU184 numbers are retired. All clock numbers live only in the jurisdiction rule pack; any hard-coded day count in code fails CI. Reminders (.ics, UU1261) read from the pack.

## PR34 (sev 4)
Ripple: PR09 measures staleness from application date; UU1395 says plan check expires 18 months after filing.
Rule: PRECEDENCE: When plan check expires or a new application is filed, the project gets a new date and the pinned pack must be re-run against current rules ('recheck needed' banner). A pin never outlives its application.

## PR35 (sev 4)
Conflict: Fee thresholds - UU221 '<750' and 'school fees >500', UU657 cites 66324(c) with 740-760 band, vs corrected UU1387 (<=750 interior livable sf, $0) and UU1388 (LAUSD $0 if <500).
Rule: PRECEDENCE: One measure = interior livable sf, used by fee meter, fee calc and school fee. Impact fee $0 at <=750. School fee charged at >=500 (exactly 500 is charged). Warn bands 740-760 and 480-520. Section numbers come from the rule pack citation (post-recodification Gov Code), not UI text. Additions (UU1384) count toward livable sf.

## PR36 (sev 5)
Conflict: Owner-prepared lot gate - UU730 blocks 3+ units vs corrected UU1379 (>4 units, >2 stories + basement, non-woodframe; 5537(b) partial stamp for non-conventional portions).
Rule: PRECEDENCE: UU1379 wins. 3-4 unit wood-frame lots stay on owner-prepared path. Non-conventional portion = 'engineer required for this portion' card (PR01 style), not a whole-project block. Engineer triggers use UU1396 (SDC D, 1 story, CRC tables); UU973 'header > X ft' placeholder is replaced by the CRC R602 header table limit.

## PR37 (sev 4)
Conflict: Hillside/fire - UU473/UU277 auto-fit refusal on hillside or slope >10% vs corrected UU1399 (ADU ban only when VHFHSZ AND Hillside, contested by HCD) and UU1390 (no EO-based refusal in burn scars; refuse SB 9 there).
Rule: PRECEDENCE: Two separate gates. LEGAL gate (is an ADU allowed?) = UU1399 both-flags rule with 'contested' badge. ENGINEERING gate (can we auto-fit?) = UU473 slope/hillside, shows 'engineer required', never says 'not allowed'. SB 9 refusal is a third, separate flow gate. PR02 still orders fire-rebuild first.

## PR38 (sev 3)
Conflict: UU1404 urgency-bill hotfix within 7 days vs UU1289 high-risk rule PRs wait for auditor, PR08 2-reviewer.
Rule: PRECEDENCE: Extend PR25 fast lane to urgency statutes: 1 maintainer + chaptered bill link, amber 'new law - unaudited' badge, never green, auditor review within 30 days or badge turns red.

## PR39 (sev 3)
Conflict: UU1401 school written agreement + COPPA program vs UU1275/UU1324 classroom mode with no account and no server.
Rule: PRECEDENCE: No-account offline classroom mode collects no personal data, so needs no school agreement. UU1401 applies only when hosted student accounts exist (L4).

## PR40 (sev 2)
Conflict: WCAG 2.1 AA (UU1397) vs WCAG 2.2 AA (UU521, UU581).
Rule: PRECEDENCE: Build and audit to 2.2 AA (superset). Legal statements cite 2.1 AA with dated deadlines from the legal config.

## PR41 (sev 3)
Conflict: UU1252 'write a Portland shadow pack before launch' vs PR20 (founder builds only LA until 25-permit gate); UU1250 Stripe Connect module vs MVP no payments.
Rule: PRECEDENCE: Portland pack = private test fixture proving the abstraction, never shipped or shown; no 'any city' claim. Stripe Connect module = L4 behind LLC (PR31). Roles: owner of record, preparer of record (PR22), operator (UU1337) and submitting agent (UU1374) are four fields in one schema.

## PR42 (sev 4)
Conflict: context.md still says 'auto-fit LA's 88 pre-approved ADU plans'; UU1456 says 55 approved; UU1457/UU1460 say MVP auto-fits only City-owned YOU-ADU; SoT s1 says 'LA pre-approved ADU site fit' with no limit.
Rule: PRECEDENCE: MVP site fit = City-owned YOU-ADU plans only. Firm plans (rest of the live count) = metadata + outbound link, no auto-fit, until a firm signs the opt-in licence. No fixed number appears in copy; the count is read live (UU1456). context.md gets a pointer, not a rewrite (PR27).

## PR43 (sev 3)
Conflict: UU1458 'record dual licence' and UU1464 'separate MPL crate' vs UU906/UU329 ADR-0001 'MPL-2.0 for forked acadrust files'. If acadrust is offered under more than one licence, ADR must state which option we elected.
Rule: PRECEDENCE: ADR-0001 stays the single licence record. acadrust is single-licence MPL-2.0 (verify6; docs.rs 0.4.1) - no election step; CI re-checks LICENSE at the pinned commit (UU001) and fails on change; modified files live in the separate MPL crate with published source (UU1464). Unmodified upstream stays a pinned dependency, not vendored.

## PR44 (sev 4)
Conflict: UU1465 cites LAMC 98.0603 for 'both clocks' but UU1395 cites 98.0605 for extensions; 98.0602 = permit expiry, 98.0603 = plan check expiry.
Rule: PRECEDENCE: Rule pack stores one citation per clock: permit expiry -> 98.0602, plan check expiry -> 98.0603, extension/reactivation -> section verified from current LAMC text. Each .ics alarm (UU1261/UU1435) shows its own citation. CI test: no clock without a citation.

## PR45 (sev 4)
Conflict: UU1462 'ADU sprinklers only if primary sprinklered; never flag' vs UU190/UU368/UU516 'LAFD 150 ft hose pull -> flag sprinkler likely'.
Rule: PRECEDENCE: Sprinkler rule = UU1462 (cite Gov Code ADU section from rule pack). Fire access >150 ft becomes its own red card 'LAFD access review needed', never worded 'sprinklers required'. Card lists options LAFD may accept; user confirms with LAFD.

## PR46 (sev 2)
Conflict: UU1461 CCPA threshold hard-coded ($26.625M) vs UU380/UU465/UU573 'CCPA notice + deletion endpoint'.
Rule: PRECEDENCE: Privacy controls ship as best practice regardless (UU380 wins in behavior). Threshold values live in the legal config with source + date, re-checked each Jan (law-watch, UU493). Ledger watches all three triggers, not just revenue.

## PR47 (sev 2)
Conflict: UU1415 Payments module (firm Stripe links) vs SoT s1 'No payments' and PR41 'Stripe Connect = L4'.
Rule: PRECEDENCE: UU1415 is a Layer 2+ module, off by default, absent from MVP manifest. Paste-link mode needs no LLC (money flows firm->client, not to us); OAuth hosted mode = L4 behind PR31.

## PR48 (sev 4)
Conflict: UU152/UU755/UU1269 'auto-export backup to iCloud/Drive' vs UU1533 (iOS PWA has no File System Access API; every save needs a tap).
Rule: PRECEDENCE: UU1533 wins on iOS. "Auto" backup exists only on desktop Chromium (File System Access folder). iOS/Safari/Firefox = weekly reminder + one-tap Share-sheet .permitpack export + "last backup X days ago" badge (red at >14 days). Copy never says "automatic" on iOS. UU869 storage.persist() stays. PR15 wording ("user's own iCloud/Drive") unchanged; mechanism per platform.

## PR49 (sev 3)
Conflict: UU868 (translated ToS binding per language) vs UU733 (English only binds); Civ Code 1632 may require Spanish translation.
Rule: PRECEDENCE: UU1521 interim rule. English binds; certified Spanish courtesy translation shown before accept, acceptance logs language + ToS version hash. UU868 binding-per-language is parked until attorney (packet UU571) rules on 1632. No negotiation, quotes or paid terms in Spanish chat flows. If attorney says 1632 applies, Spanish becomes co-binding for ES users; re-accept flow pre-built.

## PR50 (sev 3)
Conflict: UU1501/UU690/UU609 hosted share links vs SoT s1 "No server holding user data" (UU1524).
Rule: PRECEDENCE: MVP share = encrypted .permitpack file over user's own channel + passphrase (UU1524). UU1501 token/fragment/expiry/revoke design is L4 (hosted), kept as spec. UU609 "helper invite" = same file share in MVP. No UI says "link" in MVP.

## PR51 (sev 4)
Conflict: UU1507 and UU1543 are the same finding (module off -> false "no issues"). Also vs UU1251/UU1414 "any module can be switched off".
Rule: PRECEDENCE: Merge: UU1543 folds into UU1507 (keep UU1507 id, add UU1543 wording: every rule area always printed, disabled = grey "NOT CHECKED - module off" + reason). Safety-class modules (fire, egress, structural triggers) cannot be off at export. Status reads "Incomplete" while any area is NOT CHECKED. Counts as one fix, not two. Feeds SoT s3 guardrail (0 false-greens).

## PR52 (sev 3)
Conflict: licence plan (ADR-0001, MPL-2.0/Apache, PR43) vs UU1099 Deepnest plug-in (GPL-3.0), UU1024/UU1527 LGPL libs in WASM, UU1243/UU1201 bundled ANSI/AR + acad.pat hatches.
Rule: PRECEDENCE: (a) Deepnest: never linked; nesting = own NFP code, or GPL tool as separate user-installed process over file I/O (UU1526). UU1099 text amended. (b) LGPL (OCCT, IfcOpenShell): separate WASM module loaded at runtime, build scripts published, user can swap module (see UU1544). (c) Hatches: ship only our CC0 patterns authored from geometry with provenance log (UU1513); user .pat imports stay local, excluded from shared packs. ADR-0001 gets a third-party table; cargo-deny/licensee CI blocks GPL in the bundle.

## PR53 (sev 2)
Conflict: PR47 (payments module = Stripe paste-link / OAuth L4) vs UU1534 (Square, QBO).
Rule: PRECEDENCE: PR47 layer/gating unchanged; module becomes provider-neutral adapter: paste-link mode accepts Stripe, Square or QBO invoice links (no LLC, no processing, link + user-set status only). OAuth hosted mode per provider = L4 behind PR31. Module still off by default, absent from MVP manifest.

## PR54 (sev 4) - p7 close7 ripple of verify6 corrections
Conflict: fixes relying on facts verify6 proved wrong: UU1520 (LARR missing flag), UU1504 (Mello hard stop), UU1487/UU746 (AB 2533 setback, date), UU1458/UU1467/PR43 (dual licence), UU1472 (ISO 7200 fields), PR34/UU1390 (SB 9 burn areas w/o EO cite), UU1395/PR33 (90-day extension), County expiry, UU1538 (methane 'exempt' default).
Rule: PRECEDENCE: verify6 wins. (a) UU1520: ESR (ICC-ES/IAPMO-UES) primary + LABC supplement; LARR = legacy field, never flagged missing. (b) UU1504: coastal + conversion/demo -> 'DCP Mello exemption check' card first (Gov Code 65590(b) <3 units exempt); hard stop only on DCP referral to LAHD. (c) UU1487: branch on build date - pre-2020 keeps existing setback, HSC 17920.3 only; post-2020/unknown -> normal setbacks + proof-of-date prompt. (d) UU1458/UU1467/PR43: MPL-2.0 single licence, no election. (e) UU1472: ISO 7200 mandatory = legal owner, ID, issue date, sheet no., title, approver, creator, doc type; status/language/revision optional. (f) PR34 SB 9 refusal cites EO N-32-25 + LA Mayor EO 9 with expiry watch. (g) PR33/UU1395: 98.0605 day count = verify badge. (h) LA County: 106.4.1.1 plan review 12 mo; 106.5.4 permit 12 mo / 180 days. (i) UU1538/UU249: no methane 'exempt' default; status starts 'possible LADBS modification - verify' (IB P/BC 2014-102); cost meter keeps the membrane line.
