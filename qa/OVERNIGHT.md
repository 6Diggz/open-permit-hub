# Overnight loop runbook (Open Permit Hub)

Started 2026-10-25 00:01 Phoenix (07:01Z). Morning report due 07:00 Phoenix (14:00Z).

## Each wakeup (about every 60 min)
1. Check that every running agent is alive. It's stalled if no file changed in 20 min in /home/claude/opa or /home/claude/opa-b and nothing new is on origin/main. If stalled, SendMessage it once. If there's no reply by the next wakeup, stop it, commit work that passes the gate, and relaunch what's left.
2. When all fixers for the current round are done:
   a. Gate the merged main: tsc, vitest, oxlint, build, e2e.mjs, feat.mjs, cargo test.
   b. Check CI with curl on the public API. Run /home/claude/stress/e2e (node run.mjs) on the live site.
   c. Add the r3 golden_cases and promise tests to the permanent suites if they aren't already in.
   d. Update METRICS (below).
3. Start the next round when the fixers are done and the queue's severity 3+ items are all resolved:
   - Use 6–8 fresh narrow seats. Rotate focus toward areas with the most findings last round and areas never covered.
   - Keep the same streaming + test-first protocol (copy BRIEF3.md to BRIEFn.md and update the known list).
   - Run 2 fixer lanes split by file area.
   - Never-covered ideas: LA County jurisdiction pack prototype, i18n beyond EN/ES (Korean, Chinese, Armenian, Tagalog), iOS install flow, print-at-home sizes, an inspector field mode, PDF plan-set upload pre-check (UpCodes parity), markup search/filter (Bluebeam parity), aerial underlay feasibility, laser-meter Web Bluetooth feasibility, MCP agent end-to-end use by a real agent, docs/onboarding for contributors, load/perf on low-end devices.
4. LEARN: after each round, append lessons to LESSONS.md (what slowed us, which seats found the most per hour, false positives). Apply them to the next round's brief.
5. STOP RULE: keep looping until a round's new findings at severity 3+ are under 15% of the previous round's, AND there are 0 severity-5 findings, AND live e2e is all green except NEEDS_DIGGZ items. After that, switch to low-cost maintenance: one wakeup every 3 h that only runs live e2e plus rules-watch.
6. Never: change the UI style, write legal text, spend money, post publicly, or force-push. NEEDS_DIGGZ items are only collected.
7. Schedule the next wakeup (send_later, 60 min) at the end of each wakeup, unless the morning report has been sent and maintenance mode is on (then 180 min).

## Known risks for the overnight run (and the guard for each)
- The workspace can be wiped on restart. Each wakeup, copy the reusable harness into the repo at qa/: e2e suite (no oldbuild/ binaries), golden cases, OVERNIGHT.md, LESSONS.md, METRICS. Commit and push it. Never commit raw findings with unfixed security PoCs, because the repo is public. If /home/claude/opa is missing, re-clone and rebuild from qa/.
- The gh token is invalid. Use curl on the public API for CI. Pushes still work through the proxy.
- An agent can hang with no notice. The wakeup stall check covers it.
- If this session dies, a separate scheduled task fires at 14:05Z, reads the repo state and writes the morning report.
- Token/compute cost: cap each round at 8 seats + 2 fixers. Maintenance mode after the stop rule.
- Push collisions between lanes: rebase and retry. Never force-push.
- Flaky tests: rerun 3x. Only a consistent failure counts.

## Morning report (at or after 14:00Z)
Publish/update an Artifact page "Overnight Report": rounds run, findings per round (chart), fixed counts, live e2e status, parity scores, top remaining risks, and the NEEDS_DIGGZ list as one-click asks. Send a short message.

## METRICS
| Round | New findings | Sev5 | Sev4 | Sev3+ | Fixed | Live e2e |
|---|---|---|---|---|---|---|
| R1 | 110 | 5 | 24 | 72 | 84 done | 28/29 after |
| R2 | 55 | 3 | 16 | 40 | 45 done | 25/29 (3 regressions queued) |
| R3 | 80 | 1 | 13 | 55 | 74 done, 3 partial, 3 deferred | 28/29 (only Terms) |
| R4 | 53 | 1 | 7 | 31 | fixing | - |
