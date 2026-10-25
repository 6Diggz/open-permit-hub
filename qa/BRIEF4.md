# Round 4 brief (faster + deeper)
Product: Open Permit Hub (see BRIEF.md for the full context). Live: https://6diggz.github.io/open-permit-hub/. Repo: /home/claude/opa (main). Read it, but do NOT edit or commit.
If the live site lags behind main, build locally (cd /home/claude/opa/app && npm run build && npx vite preview --port <unique port>) and test that build.
New since round 3: about 75 round-3 fixes (fire separation vs house, corner lots, second story, plain answer, north arrow, title blocks, embedded fonts, parcel lookup hardening, building outlines).
Known findings: /home/claude/stress/known_titles.txt (165). File only NEW issues or regressions ("regression":true), and report dropped_as_duplicate.

SPEED RULES (new this round):
1. STREAM: append each finding the moment you confirm it, as one JSON line, to /home/claude/stress/r4/queue.jsonl. Fields: id (prefix = your seat), seat, title, domain, severity 1-5, evidence, fix, effort S/M/L, needs_diggz, regression, test. Fixers start on it right away. Do not batch findings to the end.
2. TEST-FIRST: for every finding at severity 3 or above, write a failing test the fixer can run and turn green. Put it at /home/claude/stress/r4/tests/<id>.test.ts (vitest; import from /home/claude/opa/app/src/...) or <id>.mjs (Playwright; take the BASE env var). Put that path in the "test" field.
3. DEPTH: you have one narrow scope. Go to the bottom of it. Verify everything by running it. No generic advice.
At the end, write /home/claude/stress/r4/<seat>.md (10 lines) and reply with counts by severity only.

ROUND 4 RULES (lessons learned):
- Tests must be self-contained. Put fixtures next to the test in /home/claude/stress/r4/tests/fixtures/. Use only repo helpers (app/src/test/r3/pdftext.ts for PDF text). No Python libs in vitest tests.
- Test a FROZEN copy of dist on your own port (cp -r app/dist /tmp/<seat>-dist; npx serve or python -m http.server). Never rebuild the shared app/dist.
- Before marking anything needs_diggz, check the primary source. Only money, login, signature or legal wording count.
