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
