# Governance
- **Maintainer:** @6Diggz (owner). Decides releases and rule-pack versions.
- **Rule changes** (`app/src/rules/`) need a citation, a pass test and a fail test. Once a second maintainer joins, rule changes need two approvals (see `CODEOWNERS`).
- **Second maintainer wanted:** someone who knows LA plan check or ADU permitting. See `docs/WAITING_ON_PEOPLE.md`.
- **Releases:** tag `vX.Y.Z` on `main`; the release notes name the rule pack version and its `verifiedOn` date.
- **Disagreements on a rule:** the cited source wins; when the source is unclear the app says "Need info" instead of PASS.
