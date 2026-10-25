//! OUT2-13 cleaning operations, qa-13 recovery. Each operation: before/after count, off = undone, nothing in use purged,
//! and the loss report keeps counting real losses. Generated fixture + the committed public samples (LibreDWG
//! example_2000.dwg, ezdxf-style sample.dxf); set CLEANFIX_CORPUS=<folder> to run the same checks on a whole corpus.
use acadrust::entities::{Circle, EntityType, Insert, Line, Text};
use acadrust::tables::{BlockRecord, Layer, LineType, TextStyle};
use acadrust::types::{DxfVersion, Vector3};
use acadrust::{CadDocument, DxfWriter};
use cleanfix::*;
use serde_json::Value;

fn line(layer: &str, a: (f64, f64), b: (f64, f64)) -> EntityType { let mut e = EntityType::Line(Line::from_points(Vector3::new(a.0, a.1, 0.0), Vector3::new(b.0, b.1, 0.0))); e.common_mut().layer = layer.into(); e }

/// A drawing with one of everything each operation should remove, and one of everything it must keep.
fn fixture() -> Vec<u8> {
    let mut d = CadDocument::new();
    for n in ["WALLS", "UNUSED", "USED_IN_BLOCK", "ONLY_IN_UNUSED_BLK", "HIDDEN_LAYER", "CURRENT"] { let _ = d.layers.add(Layer::new(n)); }
    for n in ["HIDDEN", "DASHED_UNUSED"] { let _ = d.line_types.add(LineType::new(n)); }
    if let Some(l) = d.layers.get_mut("HIDDEN_LAYER") { l.line_type = "HIDDEN".into(); }
    for n in ["NOTE", "UNUSED_STYLE"] { let _ = d.text_styles.add(TextStyle::new(n)); }
    d.header.current_layer_name = "CURRENT".into();
    for (name, layer) in [("USED_BLK", "USED_IN_BLOCK"), ("UNUSED_BLK", "ONLY_IN_UNUSED_BLK")] {
        let mut b = BlockRecord::new(name); b.handle = d.allocate_handle(); b.block_entity_handle = d.allocate_handle(); b.block_end_handle = d.allocate_handle();
        let bh = b.handle; d.block_records.add(b).unwrap();
        let mut e = line(layer, (0.0, 0.0), (1.0, 1.0)); e.common_mut().owner_handle = bh; d.add_entity(e).unwrap();
    }
    d.add_entity(EntityType::Insert(Insert::new("USED_BLK", Vector3::new(50.0, 50.0, 0.0)))).unwrap();
    // overkill: three overlapping collinear lines -> one 0..15; a touching line and another layer's copy stay.
    for (a, b) in [((0.0, 0.0), (10.0, 0.0)), ((5.0, 0.0), (15.0, 0.0)), ((2.0, 0.0), (3.0, 0.0)), ((15.0, 0.0), (20.0, 0.0))] { d.add_entity(line("WALLS", a, b)).unwrap(); }
    d.add_entity(line("HIDDEN_LAYER", (0.0, 0.0), (10.0, 0.0))).unwrap();
    for _ in 0..2 { let mut c = Circle::new(); c.center = Vector3::new(30.0, 0.0, 0.0); c.radius = 2.0; let mut e = EntityType::Circle(c); e.common_mut().layer = "WALLS".into(); d.add_entity(e).unwrap(); }
    // zero-length: a point-line and a zero-radius circle
    d.add_entity(line("WALLS", (7.0, 7.0), (7.0, 7.0))).unwrap();
    let mut c = Circle::new(); c.center = Vector3::new(40.0, 0.0, 0.0); c.radius = 0.0; d.add_entity(EntityType::Circle(c)).unwrap();
    // text: one real (uses NOTE), one empty
    let mut t = Text::with_value("ADU", Vector3::new(0.0, 20.0, 0.0)); t.style = "NOTE".into(); d.add_entity(EntityType::Text(t)).unwrap();
    d.add_entity(EntityType::Text(Text::with_value("   ", Vector3::new(0.0, 30.0, 0.0)))).unwrap();
    DxfWriter::new(&d).with_version(DxfVersion::AC1032).write_to_vec().unwrap()
}

fn op<'a>(r: &'a Value, id: &str) -> &'a Value { r["ops"].as_array().unwrap().iter().find(|o| o["id"] == id).unwrap_or_else(|| panic!("no op {id}: {r}")) }
fn names(v: &Value) -> Vec<String> { v["items"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect() }
fn clean_bytes(b: &[u8], o: &CleanOpts) -> Vec<u8> { clean_doc_with(read(b).unwrap(), "r2018", -1, o).unwrap().0 }

/// Every name an object uses still exists in the copy: the proof that purge removed nothing in use.
fn assert_refs_resolve(bytes: &[u8], what: &str) {
    let d = read(bytes).unwrap_or_else(|e| panic!("{what}: copy unreadable: {e}"));
    let std_lt = |n: &str| ["bylayer", "byblock", "continuous", ""].contains(&n.to_lowercase().as_str());
    for e in d.entities() {
        let c = e.common();
        assert!(c.layer.is_empty() || d.layers.contains(&c.layer), "{what}: layer {} used but purged", c.layer);
        assert!(std_lt(&c.linetype) || d.line_types.contains(&c.linetype), "{what}: line type {} used but purged", c.linetype);
        if let EntityType::Insert(i) = e { assert!(d.block_records.contains(&i.block_name), "{what}: block {} inserted but purged", i.block_name); }
        if let EntityType::Text(t) = e { assert!(t.style.is_empty() || d.text_styles.contains(&t.style), "{what}: style {} used but purged", t.style); }
    }
    for l in d.layers.iter() { assert!(std_lt(&l.line_type) || d.line_types.contains(&l.line_type), "{what}: layer {} uses purged line type {}", l.name, l.line_type); }
}

#[test]
fn out2_13_purge_removes_only_unused_and_repeats_through_blocks() {
    let f = fixture(); let r = loss_report_with(&f, "r2018", -1, &CleanOpts::default());
    assert_eq!(r["ok"], true, "{r}");
    let b = op(&r, "purge_blocks"); assert_eq!(names(b), vec!["UNUSED_BLK"], "{b}");
    assert_eq!(b["before"].as_u64().unwrap() - b["after"].as_u64().unwrap(), 1);
    let l = names(op(&r, "purge_layers"));
    assert!(l.contains(&"UNUSED".to_string()) && l.contains(&"ONLY_IN_UNUSED_BLK".to_string()), "freed by the purged block too: {l:?}");
    for keep in ["WALLS", "USED_IN_BLOCK", "HIDDEN_LAYER", "CURRENT", "0"] { assert!(!l.contains(&keep.to_string()), "{keep} is in use: {l:?}"); }
    assert_eq!(names(op(&r, "purge_linetypes")), vec!["DASHED_UNUSED"]);
    assert_eq!(names(op(&r, "purge_styles")), vec!["UNUSED_STYLE"]);
    let out = clean_bytes(&f, &CleanOpts::default()); assert_refs_resolve(&out, "fixture");
    let d = read(&out).unwrap();
    assert!(d.layers.contains("CURRENT") && d.line_types.contains("HIDDEN") && d.text_styles.contains("NOTE") && d.block_records.contains("USED_BLK"));
    assert!(!d.layers.contains("UNUSED") && !d.block_records.contains("UNUSED_BLK"));
}

#[test]
fn out2_13_overkill_merges_overlaps_keeps_touching_and_other_layers() {
    let f = fixture(); let only = CleanOpts { overkill: true, ..CleanOpts::none() };
    let r = loss_report_with(&f, "r2018", -1, &only); let o = op(&r, "overkill");
    assert_eq!(o["merged"], 1, "{o}"); assert_eq!(o["by_type"]["Line"], 2, "{o}"); assert_eq!(o["by_type"]["Circle"], 1, "{o}");
    assert_eq!(o["before"].as_u64().unwrap() - o["after"].as_u64().unwrap(), 3);
    let d = read(&clean_bytes(&f, &only)).unwrap();
    let walls: Vec<(f64, f64)> = d.entities().filter_map(|e| match e { EntityType::Line(l) if l.common.layer == "WALLS" && l.start.y == 0.0 => Some((l.start.x.min(l.end.x), l.start.x.max(l.end.x))), _ => None }).collect();
    assert!(walls.contains(&(0.0, 15.0)) && walls.contains(&(15.0, 20.0)) && walls.len() == 2, "{walls:?}");
    assert!(d.entities().any(|e| matches!(e, EntityType::Line(l) if l.common.layer == "HIDDEN_LAYER")), "other layer's copy is not a duplicate");
}

#[test]
fn out2_13_zero_length_and_empty_text_are_removed() {
    let f = fixture();
    let r = loss_report_with(&f, "r2018", -1, &CleanOpts { zero: true, ..CleanOpts::none() }); let z = op(&r, "zero");
    assert_eq!(z["by_type"]["Line"], 1, "{z}"); assert_eq!(z["by_type"]["Circle"], 1, "{z}");
    let r = loss_report_with(&f, "r2018", -1, &CleanOpts { empty_text: true, ..CleanOpts::none() }); let t = op(&r, "empty_text");
    assert_eq!(t["before"], 2); assert_eq!(t["after"], 1);
}

#[test]
fn out2_13_each_operation_switched_off_is_undone() {
    let f = fixture(); let base = read(&clean_bytes(&f, &CleanOpts::none())).unwrap();
    let orig = read(&f).unwrap();
    assert_eq!(type_counts(&base), type_counts(&orig), "no operations: nothing removed");
    assert_eq!(base.layers.len(), orig.layers.len());
    let r = loss_report_with(&f, "r2018", -1, &CleanOpts::none());
    assert!(r["ops"].as_array().unwrap().is_empty() && r["cleaned"].as_object().unwrap().is_empty(), "{r}");
    // JSON from the page: a missing key is on, false is off.
    assert_eq!(CleanOpts::from_json("{\"purge\":false}"), CleanOpts { purge: false, ..CleanOpts::default() });
    assert_eq!(CleanOpts::from_json("not json"), CleanOpts::default());
}

#[test]
fn out2_13_loss_report_counts_cleaning_apart_from_losses() {
    let f = fixture(); let r = loss_report_with(&f, "r2018", -1, &CleanOpts::default());
    assert_eq!(r["lost"], 0, "cleaning is not loss: {r}"); assert_eq!(r["changed"], 0, "{r}");
    let row = r["rows"].as_array().unwrap().iter().find(|x| x["type"] == "Line" && x["group"] == "object").unwrap();
    assert_eq!(row["status"], "cleaned", "{row}");
    assert_eq!(row["before"].as_u64().unwrap() - row["after"].as_u64().unwrap(), row["cleaned"].as_u64().unwrap(), "{row}");
    // A real loss still counts with cleaning on: R12 can't hold the INSERT's block geometry types? MText etc. from MIXED.
    let mixed = include_bytes!("fixtures/mixed_r2018.dxf");
    let r = loss_report_with(mixed, "cnc", -1, &CleanOpts::default());
    assert!(r["lost"].as_u64().unwrap() > 0, "R12 losses must still show with cleaning on: {r}");
}

#[test]
fn out2_13_audit_reports_and_fixes_missing_layers() {
    let f = String::from_utf8(fixture()).unwrap();
    // Point the real text at a layer that is not in the table.
    let bad = f.replacen("\n  8\n0\n100\nAcDbText", "\n  8\nGHOST\n100\nAcDbText", 1);
    let bytes = if bad != f { bad.into_bytes() } else { let mut d = read(f.as_bytes()).unwrap(); for e in d.entities_mut() { if let EntityType::Text(_) = e { e.common_mut().layer = "GHOST".into(); } } DxfWriter::new(&d).with_version(DxfVersion::AC1032).write_to_vec().unwrap() };
    let mut d = read(&bytes).unwrap();
    if d.layers.contains("GHOST") { d.layers.remove("GHOST"); }
    let a = cleanfix::ops::audit(&mut d.clone(), false);
    assert!(a["missing_layers"].as_array().unwrap().iter().any(|x| x == "GHOST"), "{a}");
    assert_eq!(a["fixed"], false);
    let fixed = cleanfix::ops::audit(&mut d, true);
    assert!(d.layers.contains("GHOST"), "audit fix makes the missing layer");
    assert!(fixed["after"].as_u64().unwrap() < fixed["before"].as_u64().unwrap(), "{fixed}");
}

fn corpus_checks(name: &str, bytes: &[u8]) {
    let Ok(_) = read(bytes) else { return };
    let none = loss_report_with(bytes, "r2018", -1, &CleanOpts::none());
    let all = loss_report_with(bytes, "r2018", -1, &CleanOpts::default());
    if none["ok"] != true { assert_ne!(all["ok"], true, "{name}: cleaning must not hide a write failure"); return; }
    assert_eq!(all["ok"], true, "{name}: {all}");
    // Cleaning never adds losses: anything lost with cleaning on was lost with it off too.
    assert!(all["lost"].as_u64().unwrap() <= none["lost"].as_u64().unwrap(), "{name}: cleaning added losses: {} vs {}", all["lost"], none["lost"]);
    for o in all["ops"].as_array().unwrap() { if o["group"] != "audit" { assert!(o["before"].as_u64().unwrap() >= o["after"].as_u64().unwrap(), "{name}: {o}"); } }
    let out = clean_doc_with(read(bytes).unwrap(), "r2018", -1, &CleanOpts::default()).unwrap().0;
    assert_refs_resolve(&out, name);
}

#[test]
fn out2_13_public_samples_clean_without_dangling_references() {
    for (n, p) in [("example_2000.dwg", "../qa/e2e/fixtures/example_2000.dwg"), ("sample.dxf", "../qa/e2e/fixtures/sample.dxf"), ("mixed_r2018.dxf", "tests/fixtures/mixed_r2018.dxf"), ("full_types_r2018.dxf", "tests/fixtures/full_types_r2018.dxf")] {
        corpus_checks(n, &std::fs::read(p).unwrap());
    }
}

/// Opt-in: CLEANFIX_CORPUS=/path/to/libredwg/test/test-data cargo test --release corpus -- --nocapture
#[test]
fn out2_13_corpus_from_env() {
    let Ok(dir) = std::env::var("CLEANFIX_CORPUS") else { return };
    let mut n = 0;
    for e in walk(std::path::Path::new(&dir)) { let b = std::fs::read(&e).unwrap(); corpus_checks(&e.to_string_lossy(), &b); n += 1; }
    eprintln!("corpus: {n} files checked");
}
fn walk(p: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut v = vec![]; for e in std::fs::read_dir(p).unwrap().flatten() { let q = e.path(); if q.is_dir() { v.extend(walk(&q)); } else if q.extension().map(|x| { let x = x.to_string_lossy().to_lowercase(); x == "dxf" || x == "dwg" }).unwrap_or(false) { v.push(q); } } v.sort(); v
}

#[test]
fn qa13_damaged_dwg_is_salvaged_or_refused_plainly() {
    let good = std::fs::read("../qa/e2e/fixtures/example_2000.dwg").unwrap();
    let n0 = read(&good).unwrap().entities().count();
    // Overwrite a stretch in the middle of the object data.
    let mut bad = good.clone(); let mid = bad.len() / 2; for b in &mut bad[mid..mid + 2048] { *b ^= 0x5a; }
    match read_with_notes(&bad) {
        Ok((d, notes)) => {
            let n = d.entities().count(); assert!(n > 0 && n <= n0);
            if n < n0 || !notes.is_empty() { assert!(notes.iter().any(|x| x.contains("Recovered from a damaged DWG") && x.contains("could not be read")), "{notes:?}"); }
            let r = loss_report(&bad, "r2018", -1); if !notes.is_empty() { assert_eq!(r["incomplete"], true, "a salvaged file's loss is unknown: {r}"); }
        }
        Err(e) => assert!(e.contains("damaged") || e.contains("cut off"), "plain message: {e}"),
    }
    let cut = std::fs::read("../qa/e2e/fixtures/trunc_dwg2000.dwg").unwrap();
    match read_with_notes(&cut) { Ok((d, notes)) => { let rep = inspect_doc(&d, cut.len()); assert!(!notes.is_empty() || rep["blocking"].as_str().unwrap_or("").contains("cut off"), "a cut DWG that reads must say so: {rep}"); } Err(e) => assert!(e.contains("damaged") || e.contains("cut off"), "{e}") }
}

#[test]
fn qa13_damaged_dxf_group_code_is_recovered_with_a_note() {
    let s = String::from_utf8_lossy(include_bytes!("fixtures/mixed_r2018.dxf")).to_string();
    // Break one group code in the ENTITIES section (not the end of the file).
    let at = s.find("ENTITIES").unwrap(); let i = at + s[at..].find("\n 10\n").unwrap();
    let bad = format!("{}\nXX\n{}", &s[..i], &s[i + 4..]);
    match read_with_notes(bad.as_bytes()) {
        Ok((d, notes)) => { assert!(d.entities().count() > 0); assert!(notes.iter().any(|n| n.contains("Recovered from a damaged DXF")), "{notes:?}"); }
        Err(e) => assert!(e.contains("damaged"), "{e}"),
    }
}

#[test]
fn out2_13_wide_one_point_polyline_is_a_dot_and_stays() {
    use acadrust::entities::LwPolyline; use acadrust::types::Vector2;
    let mut d = CadDocument::new();
    let mut a = LwPolyline::from_points(vec![Vector2::new(1.0, 1.0), Vector2::new(1.0, 1.0)]); a.constant_width = 2.0; d.add_entity(EntityType::LwPolyline(a)).unwrap();
    d.add_entity(EntityType::LwPolyline(LwPolyline::from_points(vec![Vector2::new(5.0, 5.0), Vector2::new(5.0, 5.0)]))).unwrap();
    d.add_entity(line("0", (0.0, 0.0), (9.0, 9.0))).unwrap();
    let b = DxfWriter::new(&d).with_version(DxfVersion::AC1032).write_to_vec().unwrap();
    let r = loss_report_with(&b, "r2018", -1, &CleanOpts { zero: true, ..CleanOpts::none() });
    assert_eq!(op(&r, "zero")["by_type"]["LwPolyline"], 1, "{r}"); assert_eq!(r["lost"], 0, "{r}");
    // R12 converts LWPOLYLINE to POLYLINE: with one removed by cleaning, the rest still count as converted, not lost.
    let r = loss_report_with(&b, "cnc", -1, &CleanOpts::default()); assert_eq!(r["lost"], 0, "{r}");
}

#[test]
fn out2_13_audit_makes_missing_text_styles_and_line_types() {
    // ezdxf recover01.dxf style: TEXT uses style ROMANS but the file has no STYLE table entry for it.
    let mut d = read(&fixture()).unwrap();
    for e in d.entities_mut() { match e { EntityType::Text(t) => t.style = "ROMANS".into(), EntityType::Line(l) => l.common.linetype = "PHANTOM".into(), _ => {} } }
    d.text_styles.remove("ROMANS"); d.line_types.remove("PHANTOM");
    let b = DxfWriter::new(&d).with_version(DxfVersion::AC1032).write_to_vec().unwrap();
    let r = loss_report_with(&b, "r2018", -1, &CleanOpts::default());
    assert!(r["audit"]["missing_styles"].as_array().unwrap().iter().any(|x| x == "ROMANS"), "{}", r["audit"]);
    let out = clean_doc_with(read(&b).unwrap(), "r2018", -1, &CleanOpts::default()).unwrap().0; assert_refs_resolve(&out, "missing refs");
}

#[test]
fn out2_13_block_library_keeps_its_blocks() {
    // LibreDWG r2.10/block.dxf: only a block definition, nothing in model space. Purge must not empty the drawing.
    let mut d = CadDocument::new();
    let mut b = BlockRecord::new("PART"); b.handle = d.allocate_handle(); b.block_entity_handle = d.allocate_handle(); b.block_end_handle = d.allocate_handle();
    let bh = b.handle; d.block_records.add(b).unwrap();
    let mut e = line("0", (0.0, 0.0), (1.0, 0.0)); e.common_mut().owner_handle = bh; d.add_entity(e).unwrap();
    let bytes = DxfWriter::new(&d).with_version(DxfVersion::AC1032).write_to_vec().unwrap();
    let r = loss_report_with(&bytes, "r2018", -1, &CleanOpts::default()); assert_eq!(r["ok"], true, "{r}");
    assert!(names(op(&r, "purge_blocks")).is_empty()); assert!(op(&r, "purge_blocks")["note"].as_str().unwrap().contains("block library"));
}
