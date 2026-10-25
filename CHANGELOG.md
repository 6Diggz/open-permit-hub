# Changelog
All notable changes. Format: Keep a Changelog. Versions: the app follows semver; the rule pack version is in `app/src/rules/pack.ts`.

## [Unreleased] - rounds 2 to 5
### App
- Plan-set PDF pre-check: reads the text of an existing plan set on the device and maps it to the LADBS correction-sheet items. It only claims what text can prove: "Not found in the text", "Conflicts with code" (a number read fails the rule) or "Says not provided" (an absence phrase such as N/A, TBD, by others, future, no aplica). Anything else is "Found on page N. Confirm it is shown as provided." at medium confidence with the quote. It never says an item is provided or approved.
- Inspector field mode (`#field`): site-visit checklist by trade and stage, one photo per item, visit PDF and site-visit `.permitpack`. A Pass over a check the app fails needs a reason and is printed as an override.
- Parcel lookup, drawn rooms, sheet readiness score, plain answer ("Likely yes / Not as entered / Not sure"), review notes and correction responses, Spanish calendar file.
- One shared verdict: the check card, PDF, HTML report and handoff README carry the same plain answer and counts. The handoff ZIP carries the site visit.
### Rules
- Plain answer is deny-by-default: any open check blocks "Likely yes" unless it is on a reviewed list of preparer details.
- Unit mix is checked on the new detached ADU path too; the house wall rating is asked for 5 to 8 ft gaps when the ADU wall has openings.

## [0.2.0] - 2026-10-24 (rule pack la-city@2026.10.2)
Fixes from stress-test round 1 (full list with tests: `docs/` and the commit log).
### Rules
- Fire separation now measures to the assumed property line halfway to the house (LADBS III-D.1), and checks eaves (III-D.2).
- Escape windows are checked per sleeping room; studios are checked too.
- Health-and-safety failures can't be dismissed. Unit mix and main building type (II-C) are checked. The entry addition gets its own setback check.
- AB 2533 applies only to units already lived in before 2020. Hillside + fire zone is a note for conversions. Connection fee is $0 for a state conversion.
- One code-cycle record for the whole pack; the app warns when the rules are past their review date.
### App
- Restoring a plain backup works again. Bad numbers (1/0", NaN) are refused and old damaged saves are repaired.
- Two tabs on one project no longer overwrite each other silently. "All projects" works on phones. Back button moves between steps.
- Works offline after one visit, including every export and Clean and Fix; new versions show an "update ready" prompt.
- DXF export is DXF 2018 in inches with closed polylines and dimensions. Sheet A-2 lists windows and safety items. CSV escapes inch marks.
- Clean and Fix shows what each format will lose before saving and refuses to save an empty or cut-off drawing.
### MCP
- Symlinks are resolved and checked; writes never follow links; file text stays inside the user-data wrapper; size limits; code-section citation check.
