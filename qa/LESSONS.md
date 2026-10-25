# Lessons (append each round)
- R1: One big batch fixer took 60 min with no pushes. Push in chunks.
- R2: Fixers claimed "done" without a CI run (rules-watch). Require CI-green proof from the public API.
- R2: The e2e matcher broke on reworded text. Tests should check the information, not exact wording.
- R3: Streaming + test-first made the seats faster, but one fixer couldn't keep up (3 fixes vs 80 findings). Run 2+ lanes split by file area from the start.
- R3: Seats rebuilding app/dist broke other seats' offline tests. Each agent tests a frozen copy of dist on its own port.
- R3: A "needs Diggz" call (bath ceiling) was answerable from the primary source. Check the source before escalating.
- R3: Golden cases (13 hand-derived lots) found the highest-value bugs. Grow this suite each round.
