# DWG and DXF fidelity

What Clean and Fix keeps, and how we know. Numbers below are measured, not estimated.

- **Reading**: DWG R14 to 2018 and ASCII DXF, through `acadrust` 0.6.7 (MPL-2.0). A cut-off ASCII DXF is recovered up to the last complete object. A damaged DWG or DXF gets a best-effort salvage (the reader's failsafe mode plus safe structure repairs), and the app says plainly how many records were read and that the rest are missing.
- **Writing**: DXF 2018 and DXF 2000 are the safe choices. DXF R12 (laser/CNC) drops newer object types. **DWG 2018 writing stays labeled beta**: see the measured rate below.
- **Before every save** the app writes the copy in memory, reads it back and shows a table of every object and data type that is kept, reduced, lost, converted or removed by a cleaning step. Losses need a tick to save.

## Measured pass rate (OUT-19)

Measured 2026-10-25 with `scripts/dwg-fidelity.sh` on two public sample corpora:
LibreDWG `test/test-data` (commit a8ccb1f, 141 DWG + 67 DXF, R13 to 2018 plus damaged samples) and
ezdxf `examples_dxf` + `integration_tests/data` (commit 7b20261, 83 DXF). 291 files in total.

Each file goes read -> write -> read with no cleaning steps. A file **passes** when every drawing object comes back
with the same type, layer, extents and text. "Hidden data" also requires every non-drawing record (dictionaries,
app data, styles) to come back.

| Step | DXF 2018 output | DWG 2018 output (beta) |
|---|---|---|
| Files read | 282 of 291 (97%) | 282 of 291 (97%) |
| Files with drawing objects (11 ezdxf samples are empty) | 271 | 271 |
| Copy written | 270 of 271 | 261 of 271 |
| **Pass: every drawing object kept** | **242 of 271 (89%)** | **230 of 271 (85%)** |
| Pass including hidden data | 238 of 271 (88%) | 97 of 271 (36%) |

By source, drawing objects kept: DWG inputs 119 of 133 to DXF 2018 and 121 of 133 to DWG; DXF inputs 123 of 138 to DXF 2018 and 109 of 138 to DWG.

What fails, most common first:
- 9 files can't be read at all: 8 LibreDWG DWG samples (`entities`, `dim`, `block`, `tmp_line` in versions or features the reader does not support yet) and 1 DXF. The app says so in plain words.
- DXF 2018: TOLERANCE objects come back changed (16 files); a few 3D solids, MText and 3DLINE records.
- DWG 2018: splines come back with a different shape (12 files), some MText; 9 files can't be written at all (DATATABLE and other custom objects) and the app tells the user to save as DXF 2018.
- DWG 2018 drops most hidden app data (DataObject records, extension records), which is why its hidden-data rate is low. Drawing objects are not affected, but other CAD apps' private data is not kept.

No file crashed or timed out (120 s per file).

What this does not measure: opening the copies in a second, independent CAD reader (AutoCAD, BricsCAD, ODA). That
needs software that is not free, so it is not done here.

## Tests

- `clean/tests/clean.rs` and `clean/tests/ops.rs` (cleaning steps, recovery, the committed LibreDWG `example_2000.dwg` and ezdxf-style `sample.dxf`).
- `CLEANFIX_CORPUS=<folder> cargo test --release --test ops corpus_from_env` runs the cleaning checks (nothing in use purged, cleaning never adds a loss) on a whole corpus.
- The browser tests in `app/e2e/e2e.mjs`.

The corpus files are not copied into this repository (LibreDWG's are GPL); the script fetches them.
