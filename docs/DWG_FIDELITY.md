# DWG and DXF fidelity

What Clean and Fix keeps, and how we know.

- **Reading**: DWG R14 to 2018 and ASCII DXF, through `acadrust` 0.6.7 (MPL-2.0). A cut-off ASCII DXF is recovered up to the last complete object, with a note.
- **Writing**: DXF 2018 and DXF 2000 are the safe choices. DXF R12 (laser/CNC) drops newer object types. **DWG 2018 writing is labeled beta** in the app: some drawings (for example ones with DATATABLE objects) can't be written yet and get a plain message telling the user to save as DXF 2018.
- **Before every save** the app writes the copy in memory, reads it back and shows a table of every object and data type that is kept, reduced, lost or converted. Losses need a tick to save.
- **Tests**: `clean/tests/clean.rs` (generated fixture: line, polyline, MText, text, spline, ellipse, hatch, circle, arc) and the browser test in `app/e2e/e2e.mjs`.
- **Not yet published**: a pass rate over a public DWG corpus (R14 to 2018) opened in a second CAD reader. Until that exists, keep the beta label.
