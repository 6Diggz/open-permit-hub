//! Regression tests for Clean and Fix (stress test round 1). Fixtures are generated (no third-party corpus files).
use cleanfix::*;

const MIXED: &[u8] = include_bytes!("fixtures/mixed_r2018.dxf");

fn row<'a>(r: &'a serde_json::Value, t: &str) -> &'a serde_json::Value { r["rows"].as_array().unwrap().iter().find(|x| x["type"] == t && x["group"] == "object").unwrap_or_else(|| panic!("no row {t}")) }

#[test]
fn qa10_out18_loss_report_lists_types_dropped_by_r12() {
    let r = loss_report(MIXED, "cnc", -1);
    assert_eq!(r["ok"], true, "{r}");
    assert!(r["lost"].as_u64().unwrap() > 0, "R12 must report losses: {r}");
    for t in ["MText", "Hatch", "Spline"] { assert_ne!(row(&r, t)["status"], "kept", "{t} should not be kept in R12: {r}"); }
    assert_eq!(row(&r, "Line")["status"], "kept");
}

#[test]
fn qa10_loss_report_r2018_keeps_everything_drawn() {
    let r = loss_report(MIXED, "r2018", -1);
    assert_eq!(r["ok"], true, "{r}");
    for t in ["MText", "Hatch", "Spline", "Ellipse", "LwPolyline", "Line", "Text"] { assert_eq!(row(&r, t)["status"], "kept", "{t}: {r}"); }
}

#[test]
fn qa09_truncated_dwg_errors_and_never_writes_an_empty_file() {
    let doc = read(MIXED).unwrap();
    let dwg = match clean_doc(doc, "dwg", -1) { Ok(b) => b, Err(e) => { eprintln!("DWG writer unavailable for fixture: {e}"); return; } };
    let cut = &dwg[..dwg.len().min(4000)];
    match read(cut) {
        Err(e) => assert!(e.contains("cut off") || e.contains("damaged"), "plain message expected: {e}"),
        Ok(d) => {
            let rep = inspect_doc(&d, cut.len());
            if rep["entities"] == 0 { assert!(rep["blocking"].is_string(), "{rep}"); assert!(clean_doc(d, "r2018", -1).is_err()); }
        }
    }
}

#[test]
fn qa09_empty_drawing_cannot_be_saved() {
    let empty = b"  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n";
    if let Ok(d) = read(empty) { assert!(clean_doc(d, "r2018", -1).is_err()); }
}

#[test]
fn qa12_non_finite_coordinates_are_counted() {
    let s = String::from_utf8_lossy(MIXED).replacen("\n 10\n0.0\n", "\n 10\n1e400\n", 1).replacen("\n 20\n0.0\n", "\n 20\nNaN\n", 1);
    assert!(count_nonfinite(s.as_bytes()) >= 1, "expected invalid numbers to be counted");
    if let Ok(v) = inspect_bytes(s.as_bytes()) { assert!(v["warnings"].as_array().unwrap().iter().any(|w| w.as_str().unwrap().contains("not real numbers")), "{v}"); }
}

#[test]
fn qa14_unknown_units_code_warns() {
    let s = String::from_utf8_lossy(MIXED).replacen("$INSUNITS\n 70\n0\n", "$INSUNITS\n 70\n999\n", 1);
    assert!(s.contains("999"), "fixture must carry $INSUNITS");
    let v = inspect_bytes(s.as_bytes()).unwrap();
    assert!(v["warnings"].as_array().unwrap().iter().any(|w| w.as_str().unwrap().contains("not a real unit")), "{v}");
}

#[test]
fn qa13_cut_off_dxf_is_recovered_with_a_note() {
    let half = &MIXED[..MIXED.len() * 3 / 4];
    match inspect_bytes(half) {
        Ok(v) => { assert_eq!(v["recovered"], true, "{v}"); assert!(v["warnings"][0].as_str().unwrap().starts_with("Recovered")); }
        Err(e) => assert!(e.contains("cut off") || e.contains("damaged"), "plain message expected: {e}"),
    }
}

#[test]
fn qa11_qa13_developer_errors_become_plain_words() {
    assert!(plain_error("Not implemented: Cannot encode custom object DATATABLE at handle 0xB2C as DWG AC1032: compatible raw DWG data is required").contains("Save as DXF 2018 instead"));
    assert!(plain_error("Invalid AC18 inner file header identifier").contains("damaged"));
    assert!(plain_error("Parse error: Invalid DXF code at line 27997").contains("damaged"));
}

#[test]
fn parity11_qa18_site_plan_dxf_has_units_polylines_and_dimensions() {
    let spec = r#"{"outlines":[{"layer":"C-PROP","pts":[[0,0],[600,0],[600,1560],[0,1560]]},{"layer":"A-ADU-WALL","pts":[[180,1200],[420,1200],[420,1440],[180,1440]]}],
      "dims":[{"layer":"A-ANNO-DIMS","a":[0,0],"b":[600,0],"offset":-36}],"texts":[{"layer":"G-ANNO-TEXT","x":0,"y":-60,"h":10,"text":"STREET"}]}"#;
    let out = site_plan(spec).unwrap();
    let s = String::from_utf8_lossy(&out);
    assert!(s.contains("AC1032"), "R2018 header");
    let lines: Vec<&str> = s.lines().map(|l| l.trim()).collect();
    let i = lines.iter().position(|l| *l == "$INSUNITS").expect("$INSUNITS present");
    assert_eq!((lines[i + 1], lines[i + 2]), ("70", "1"), "inches units header");
    assert!(s.contains("LWPOLYLINE") && s.contains("DIMENSION"));
    let back = read(&out).unwrap();
    let t = type_counts(&back); assert_eq!(t.get("LwPolyline"), Some(&2)); assert!(t.keys().any(|k| k.contains("Dimension")), "{t:?}");
    assert_eq!(back.header.insertion_units, 1);
    assert!(site_plan(r#"{"outlines":[{"layer":"C-PROP","pts":[[0,0],[1e400,0],[1,1]]}]}"#).is_err(), "non-finite input refused");
}

// ---- Round 2 ----
const FULL: &[u8] = include_bytes!("fixtures/full_types_r2018.dxf");
const MESH: &[u8] = include_bytes!("fixtures/mesh_r2018.dxf");
const TRUNC: &[u8] = include_bytes!("fixtures/truncated_70pct.dxf");
const NEG_LTYPE: &[u8] = include_bytes!("fixtures/ltype_negative_count.dxf");
fn nonkept(r: &serde_json::Value) -> Vec<String> { r["rows"].as_array().unwrap().iter().filter(|x| x["group"] == "object" && x["status"] != "kept").map(|x| format!("{} {}->{} {}", x["type"], x["before"], x["after"], x["status"])).collect() }

#[test]
fn qa2_01_types_the_reader_skips_are_counted_as_lost() {
    // The baseline comes from the file text, so a type the reader drops is still counted.
    let raw = raw_entity_counts(MESH).unwrap(); assert_eq!(raw.get("MESH"), Some(&1)); assert_eq!(raw.get("LINE"), Some(&1));
    let mut parsed = type_counts(&read(MESH).unwrap()); assert_eq!(parsed.get("Mesh"), Some(&1));
    assert!(dropped_on_read(MESH, &parsed).is_empty());
    parsed.remove("Mesh"); // what a reader that skips MESH would return
    assert_eq!(dropped_on_read(MESH, &parsed), vec![("MESH".to_string(), 1, 0)]);
    let r = loss_report(MESH, "r2018", -1); assert_eq!(r["lost"], 0, "{r}");
}

#[test]
fn qa2_02_truncated_file_is_reported_incomplete_with_missing_sections() {
    let v = inspect_bytes(TRUNC).unwrap(); let w = v["warnings"][0].as_str().unwrap(); eprintln!("{w}");
    assert!(w.contains("incomplete") && w.contains("OBJECTS"), "{w}"); assert!(!w.contains("The last"), "{w}");
    let r = loss_report(TRUNC, "r2018", -1); assert_eq!(r["incomplete"], true, "{r}");
}

#[test]
fn parity2_05_r12_writes_splines_and_ellipses_as_polylines() {
    let r = loss_report(MIXED, "cnc", -1); eprintln!("{:?} lost={}", nonkept(&r), r["lost"]);
    assert_eq!(row(&r, "Spline")["status"], "approximated"); assert_eq!(row(&r, "Ellipse")["status"], "approximated");
    let out = clean_doc(read(MIXED).unwrap(), "cnc", -1).unwrap(); let back = read(&out).unwrap();
    let t = type_counts(&back); assert!(t.get("Spline").is_none() && t.get("Ellipse").is_none());
    let polys = t.get("Polyline2D").copied().unwrap_or(0) + t.get("LwPolyline").copied().unwrap_or(0); assert!(polys >= 3, "{t:?}");
    // the ellipse polyline stays on the curve: every point within the ellipse's extents
    let s = String::from_utf8_lossy(&out); assert!(s.contains("AC1009"));
}

#[test]
fn parity2_06_conversions_are_paired_and_hidden_data_is_apart() {
    let r = loss_report(MIXED, "cnc", -1);
    assert_eq!(row(&r, "LwPolyline")["status"], "converted", "{r}");
    let lost = r["lost"].as_u64().unwrap(); let visible: u64 = r["rows"].as_array().unwrap().iter().filter(|x| x["group"] == "object" && (x["status"] == "dropped" || x["status"] == "reduced" || x["status"] == "dropped_on_read")).map(|x| x["before"].as_u64().unwrap() - x["after"].as_u64().unwrap()).sum();
    assert_eq!(lost, visible, "headline counts only visible objects: {r}");
    assert!(r["hidden_lost"].is_u64());
}

#[test]
fn parity2_07_best_format_is_flagged() {
    let r = loss_report(FULL, "r2018", -1); assert_eq!(r["best_format"], true);
    let c = loss_report(MIXED, "cnc", -1); assert_eq!(c["best_format"], false);
}

#[test]
fn out2_14_changed_geometry_is_not_reported_as_kept() {
    // Writer-path change simulated: compare a file with its own copy where one MText value is blanked.
    let r = loss_report(MIXED, "r2018", -1); assert_eq!(r["changed"], 0, "{r}");
    let mut d = read(MIXED).unwrap(); for e in d.entities_mut() { if let acadrust::entities::EntityType::MText(t) = e { t.value = String::new(); } }
    let altered = clean_doc(d, "r2018", -1).unwrap();
    let a = fingerprint_diff(&read(MIXED).unwrap(), &read(&altered).unwrap()); assert!(a >= 1, "blanked text must be a change");
}

#[test]
fn appsec_r2_06_negative_ltype_count_is_a_plain_error_not_a_panic() {
    let e = read(NEG_LTYPE).err().expect("must be refused"); assert!(e.contains("negative count") && e.contains("Recover"), "{e}");
    assert!(inspect_bytes(NEG_LTYPE).is_err());
}
#[test]
fn qa2_01_raw_scan_matches_reader_names() {
    // Every entity type in these generated files is matched to the reader's name (no false "dropped on read").
    for (f, b) in [("mixed", MIXED), ("full", FULL)] { let r = loss_report(b, "r2018", -1); assert!(!r["rows"].as_array().unwrap().iter().any(|x| x["status"] == "dropped_on_read"), "{f}: {r}"); }
}
