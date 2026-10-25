# UX findings: garage-to-ADU checker (cold homeowner + busy drafter)

Tested at 1440x900 and 390x844, in English and Spanish. The walk went Lot, Garage, Rooms, Checks, then Export. The test lot was 4512 Maple Ave, 50x140, with a 30x45 house set 20 ft back. The garage was 20' x 20'6", 13 ft tall, with a 7'6" ceiling and 360 sf inside, plus 1 bedroom. Screenshots are in /tmp/claude-0/ux/ (D* = desktop, M* = mobile, S* = Spanish). Downloads saved there too: report.pdf, site.pdf, site.dxf.

Findings are ranked by how much harm they do.

## P0: breaks trust or the task

1. **Spanish mode is only half translated.** Nav and buttons switch to Spanish. Everything else stays English: every form label ("Outside width", "Was the garage built with a permit?"), Yes/No/Don't know, the hints, the diagram labels, the Export page, the materials table and the "Language" label. Card bodies mix both languages, for example "Corregir: Muros resistentes…" next to an English "CRC R302.1 (walls under 5 ft…)". An ESL homeowner who picks Español hits English on the first field (S2.png, S5). The project title "My garage conversion" stays English too. *Fix:* route every string through i18n. Add a test that fails when a key is missing in `es`. Translate the citation glosses, and keep the code numbers as they are.
2. **The garage's real position can't be typed in.** The only way to place it is to drag the ADU box. The defaults put it 2'0" from the side line, which fires a red **Fix: fire-rated walls** before I have entered anything (d1.png). A homeowner thinks "my garage is already illegal?" A drafter needs exact numbers. *Fix:* add "Distance from garage to side line / rear line / house" fields that stay synced with the drag. Show no Fix until the user has set the position (show "Need info: place your garage").
3. **Lot defaults look like real data.** Lot 50'x130', house 30'x45' and 20' are pre-filled as real values, not placeholders. A rushed user can skip them and get a report about a lot that isn't theirs. *Fix:* leave the fields empty with placeholder examples, or tag defaults "example — replace". The report should list any field still on its default.
4. **"Citation being verified" / "[citation pending verification]"** shows on core rules (SET-01, ALM-01, CEI-01) in the app and in the PDF. To a homeowner it reads as "this app isn't sure". To a plan checker it reads as unfinished. *Fix:* verify them before release. Otherwise show a neutral "source: CA Gov. Code §66314 (link)" and keep the verification state internal.
5. **The Lot page's City dropdown starts on "Not sure yet" and is easy to mis-set.** I picked "Unincorporated LA County" (the option under LA City). The whole result then became "Address not supported yet", and the handoff ZIP locked silently with a grey button (D5). There's no address lookup. *Fix:* geocode or parse the address and suggest the city. Put the jurisdiction choice first, as its own gate. Explain the locked ZIP next to the button itself, not only in a box above.

## P1: confusion and missing guidance

6. **Jargon with no explanation:** APN, ZIMAS, HPOZ, Coastal Zone/Mello Act, methane zone, "1-hour fire-rated wall", "hose pull", "Title 24", "clear opening", "sill height", "Added floor area", "easements in your title report", "Overall height" (to the ridge? from what point?). *Fix:* add an (i) tooltip to each with one plain sentence and, where it helps, a small photo or diagram, for example a tape on an open window for clear width/height.
7. **The ZIMAS questions ask the user to go elsewhere with no link and no "how".** It says "check the parcel in ZIMAS" but gives no button that opens ZIMAS for the address, and doesn't say which ZIMAS tab shows each answer. *Fix:* add an "Open ZIMAS for this address" deep link and a note under each question naming the ZIMAS panel to look at ("Planning & Zoning → Hillside Area").
8. **Card text tells me to "Check the box once you know" (SET-01), but the UI uses Yes/No toggles, not boxes.** *Fix:* change it to "Then answer 'Was the garage built with a permit?' on the Garage step", and make that text a link that jumps there.
9. **Eleven "Don't know" answers on the Lot step all start pre-selected (black).** That makes them look like answers I gave. *Fix:* start with nothing selected, and show "Don't know" as an explicit, lighter choice.
10. **No sense of progress or what's left.** The red/amber dots on the steps have no legend. The card says "13 Need info", and there's no "jump to next missing item". *Fix:* add a legend, make cards clickable so they focus the matching field, and add a "3 answers left" counter.
11. **Interior livable area (sq ft) has to be worked out by hand.** *Fix:* suggest a value from outside size minus wall thickness, and let the user accept it with one click.
12. **The Checks step lets a homeowner turn off whole rule groups and "Dismiss" items.** Neither is explained, so it's risky for a beginner. *Fix:* hide it behind "Advanced (for professionals)" in homeowner mode.

## P1: visual problems

13. **The ADU label overflows its box** ("20' 0" x 20' 6"" is clipped by the border in d1/D2). The red "2' 0" to line" label crosses the lot line. *Fix:* put the label outside the box or scale the text down, and place dimension labels outside the lot line with leader lines.
14. **The diagram doesn't feel live.** The garage is a hatched "Existing house" and a yellow "ADU", with no street, driveway, north arrow or scale. *Fix:* draw the street edge, a north arrow and a scale bar. Label the box "Garage → ADU".
15. **The APN input is taller and sits lower than its row neighbors** (d1, Lot row 1). The Added floor area input on the Garage step is misaligned the same way. *Fix:* use the same input height everywhere, with a uniform helper-text slot.
16. **The segmented Yes/No/Don't know controls leave a dead gray strip** to the right of the buttons inside their container, and the "What are you building?" control does the same. *Fix:* make the container hug the buttons or stretch the buttons to fill it.
17. **The right Check panel jumps.** On long pages the sticky panel detaches mid-page, as in D2/D5 where it starts at about y=760 or 1140 and leaves a blank column above. *Fix:* use `position: sticky; top: 16px; max-height: 100vh; overflow: auto` on the panel's column.
18. **Mobile:** the header crams "Garage to ADU check ① Lot ②…" and cuts it off. The Check card plus about 20 result cards stack *under* the form, which makes the page about 6,400 px long (M1). *Fix:* add a compact sticky "1 Fix · 12 Need info ▸" bar that opens the results as a sheet, and a step header like "Step 1 of 5 · Lot".
19. **Helper text is small and light gray** (about 12 px), as are the citation lines (about 11 px). Contrast is borderline for older users. *Fix:* use 14 px minimum and darken to at least 4.5:1 contrast.
20. **The windows block** puts a checkbox and "Remove window" in the middle column at different heights. *Fix:* use one row of checkboxes and a quiet text "Remove" link at the top right.

## P1: export and trust

21. **The draft site plan PDF (24x36) is almost empty.** It shows only the outlines, a big watermark, tiny dimension text and a 1-line north arrow. There's no setback dimensions you can read, no driveway, utilities, easements or legend, and no vicinity map. A drafter can't use it, and a homeowner can't read it. *Fix:* add dimension strings at plan-sheet text height (at least 3/32"), setback callouts, a legend, a vicinity map and a filled title block (owner, preparer, APN, zoning).
22. **The Materials estimate sits next to the permit outputs**, and it is built from guesses (no window or door count, 12% waste). It looks generic and AI-made, and it pulls attention away from the task. *Fix:* move it to a separate optional tab with "rough, for budgeting" wording, or remove it.
23. **The scam footer line and "Nothing here is a permit" are good**, but the main promise is hidden. *Fix:* add a one-line "What you'll get" on the start screen (a check report plus a draft site plan for your drafter), with a sample thumbnail.
24. **The DXF uses R12 (AC1009) with only 6 layers.** *Fix (drafter):* use AIA layer names (A-WALL, C-PROP, A-ANNO-DIMS), a units header ($INSUNITS = inches) and a real-world origin. Also offer a 2018 DXF.

## Drafter (20 jobs a year) needs

25. **Multiple projects:** there's no project list, duplicate or rename (the title is fixed as "My garage conversion"). *Fix:* add a project dashboard with search by address, plus a "duplicate from previous job" option.
26. **Speed:** no keyboard-first entry, no paste of ZIMAS parcel data, and no APN lookup that auto-fills the lot. *Fix:* parse a pasted ZIMAS report, and support tab order plus Enter to go to the next step.
27. **The preparer profile is retyped every time** (name, license and stamp info). *Fix:* save a preparer profile on the device and apply it automatically.
28. **No client hand-off loop.** "Save locked copy to share" isn't explained. *Fix:* explain what "locked" means, and add a "send to my client to fill in the Yes/No answers" link or file.
29. **Rule version in the header ("LA City · 2026.10.0")** is good for drafters, but it has no changelog. *Fix:* link "what changed in this rule version".
30. **No room layout or floor plan.** The step is called "Rooms" but it only takes a bedroom count and windows. *Fix:* rename it "Bedrooms & windows", or add a simple room grid. A drafter would want the floor plan in the DXF.

## What builds trust today
- Clear "Software check, not a city review" wording, a date stamp, rule IDs with code citations, an anti-scam note and on-device storage.
- The Fix / Need info / Pass cards each have a "Next:" action, which is the strongest part of the app.

## What breaks trust today
- Half-English Spanish mode, alarming Fix results on default data, "citation being verified" tags, and a near-empty site plan PDF.
