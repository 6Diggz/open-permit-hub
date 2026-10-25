//! Clean and Fix (Layer 2 MVP). Never touches the original: reads bytes, returns a report and a clean copy.
use acadrust::entities::{Dimension, DimensionAligned, EntityType, LwPolyline, Text};
use acadrust::tables::Layer;
use acadrust::types::{DxfVersion, Vector2, Vector3};
use acadrust::{CadDocument, DwgReader, DxfReader, DxfWriter};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

const UNITS: [&str; 21] = ["Unitless","Inches","Feet","Miles","Millimeters","Centimeters","Meters","Kilometers","Microinches","Mils","Yards","Angstroms","Nanometers","Microns","Decimeters","Decameters","Hectometers","Gigameters","Astronomical units","Light years","Parsecs"];
const STD_FONTS: [&str; 8] = ["txt", "simplex", "romans", "arial", "isocp", "romand", "complex", "monotxt"];

pub fn is_dwg(b: &[u8]) -> bool { b.len() > 6 && &b[0..2] == b"AC" && b[2..6].iter().all(|c| c.is_ascii_digit()) }

/// Developer errors from the CAD library, turned into plain words a homeowner or drafter can act on.
pub fn plain_error(e: &str) -> String {
    let l = e.to_lowercase();
    let msg = if l.contains("cannot encode custom object") || l.contains("compatible raw dwg data") {
        let what = e.split("custom object ").nth(1).and_then(|s| s.split_whitespace().next()).unwrap_or("custom");
        format!("This drawing has {what} objects that DWG 2018 can't hold yet. Save as DXF 2018 instead.")
    } else if l.contains("not implemented") || l.contains("unsupported") {
        "This file uses a feature this tool can't write yet. Save as DXF 2018 instead.".to_string()
    } else if l.contains("unexpected end") || l.contains("eof") || l.contains("truncat") || l.contains("out of range") || l.contains("unexpected eof") || l.contains("failed to fill whole buffer") {
        "This file is cut off or damaged. Ask the sender to send it again.".to_string()
    } else if l.contains("header identifier") || l.contains("invalid dxf code") || l.contains("parse error") || l.contains("invalid") || l.contains("crc") || l.contains("checksum") {
        "This file is damaged and can't be read. Ask the sender to save it again, or open it in their CAD app and run Recover.".to_string()
    } else { return e.to_string(); };
    format!("{msg} (Details: {})", e.chars().take(160).collect::<String>())
}

fn read_dxf(bytes: &[u8]) -> Result<CadDocument, String> {
    DxfReader::from_reader(Cursor::new(bytes.to_vec())).map_err(|e| e.to_string())?.read().map_err(|e| e.to_string())
}

/// Lenient pass for ASCII DXF that was cut off: keep everything up to the last complete entity,
/// close the open section and add EOF. Returns the repaired bytes and how many lines were dropped.
pub fn salvage_dxf(bytes: &[u8]) -> Option<(Vec<u8>, usize)> {
    let text = std::str::from_utf8(bytes).ok()?;
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() < 4 { return None; }
    // last group-code 0 line pair that starts an entity or ends a section
    let mut cut = None;
    let mut i = 0;
    while i + 1 < lines.len() {
        if lines[i].trim() == "0" { cut = Some(i); }
        i += 2;
    }
    let cut = cut?;
    let in_section = lines[..cut].iter().rev().step_by(1).find(|l| { let t = l.trim(); t == "SECTION" || t == "ENDSEC" }).map(|l| l.trim() == "SECTION").unwrap_or(false);
    let mut out = lines[..cut].join("\n");
    if in_section { out.push_str("\n  0\nENDSEC"); }
    out.push_str("\n  0\nEOF\n");
    Some((out.into_bytes(), lines.len() - cut))
}

/// Read a DWG or DXF. For a cut-off DXF, retry once with `salvage_dxf` and report what was skipped.
pub fn read_with_notes(bytes: &[u8]) -> Result<(CadDocument, Vec<String>), String> {
    if is_dwg(bytes) {
        return DwgReader::from_stream(Cursor::new(bytes.to_vec())).read().map(|d| (d, vec![])).map_err(|e| format!("Could not read DWG: {}", plain_error(&e.to_string())));
    }
    match read_dxf(bytes) {
        Ok(d) => Ok((d, vec![])),
        Err(e) => {
            let text = String::from_utf8_lossy(bytes);
            let has_eof = text.trim_end().ends_with("EOF");
            if !has_eof {
                if let Some((fixed, dropped)) = salvage_dxf(bytes) {
                    if let Ok(d) = read_dxf(&fixed) {
                        return Ok((d, vec![format!("Recovered: this file was cut off. The last {dropped} lines (an unfinished object) were skipped. Ask the sender for a full copy if something is missing.")]));
                    }
                }
            }
            Err(format!("Could not read DXF: {}", plain_error(&e)))
        }
    }
}
pub fn read(bytes: &[u8]) -> Result<CadDocument, String> { read_with_notes(bytes).map(|(d, _)| d) }

fn kind(e: &EntityType) -> String { let d = format!("{e:?}"); d.split(|c: char| c == '(' || c == ' ' || c == '{').next().unwrap_or("Unknown").to_string() }
fn obj_kind(o: &acadrust::objects::ObjectType) -> String { let d = format!("{o:?}"); d.split(|c: char| c == '(' || c == ' ' || c == '{').next().unwrap_or("Unknown").to_string() }

pub fn type_counts(doc: &CadDocument) -> BTreeMap<String, usize> {
    let mut types: BTreeMap<String, usize> = BTreeMap::new();
    for e in doc.entities() { *types.entry(kind(e)).or_default() += 1; }
    types
}
pub fn object_counts(doc: &CadDocument) -> BTreeMap<String, usize> {
    let mut types: BTreeMap<String, usize> = BTreeMap::new();
    for o in doc.objects.values() { *types.entry(obj_kind(o)).or_default() += 1; }
    types
}

/// Numbers in an ASCII DXF that are not finite (1e400, NaN, inf). CAD readers silently turn these into 0.
pub fn count_nonfinite(bytes: &[u8]) -> usize {
    if is_dwg(bytes) { return 0; }
    let text = String::from_utf8_lossy(bytes);
    let mut n = 0; let mut it = text.lines();
    while let (Some(code), Some(val)) = (it.next(), it.next()) {
        if let Ok(c) = code.trim().parse::<i32>() {
            let float_code = (10..=59).contains(&c) || (110..=149).contains(&c) || (210..=239).contains(&c) || (1010..=1059).contains(&c);
            if float_code { if let Ok(v) = val.trim().parse::<f64>() { if !v.is_finite() { n += 1; } } else if val.trim().eq_ignore_ascii_case("nan") || val.trim().to_lowercase().contains("inf") { n += 1; } }
        }
    }
    n
}

pub fn inspect_doc(doc: &CadDocument, size: usize) -> Value {
    let types = type_counts(doc);
    let total: usize = types.values().sum();
    let splines = types.get("Spline").copied().unwrap_or(0); let ellipses = types.get("Ellipse").copied().unwrap_or(0);
    let text: usize = types.iter().filter(|(k, _)| k.contains("Text")).map(|(_, v)| v).sum();
    let fonts: Vec<Value> = doc.text_styles.iter().map(|s| {
        let file = if !s.true_type_font.is_empty() { s.true_type_font.clone() } else { s.font_file.clone() };
        let base = file.to_lowercase().rsplit(['/', '\\']).next().unwrap_or("").trim_end_matches(".shx").trim_end_matches(".ttf").to_string();
        json!({ "style": s.name, "font": file, "standard": base.is_empty() || STD_FONTS.contains(&base.as_str()), "bigfont": s.big_font_file })
    }).collect();
    let xrefs: Vec<Value> = doc.block_records.iter().filter(|b| !b.xref_path.is_empty()).map(|b| {
        let abs = b.xref_path.contains(':') || b.xref_path.starts_with('/') || b.xref_path.starts_with("\\\\");
        json!({ "name": b.name, "path": b.xref_path, "absolute": abs, "fix": if abs { "Will be rewritten to a relative path (file name only)" } else { "OK (relative)" } })
    }).collect();
    let u = doc.header.insertion_units; let units = if (0..=20).contains(&u) { UNITS[u as usize] } else { "Unknown" };
    let mut warnings: Vec<String> = vec![];
    let mut blocking: Option<String> = None;
    if total == 0 {
        let msg = if size > 2048 { "No drawing objects were found, but the file is not empty. It is probably cut off or damaged. Ask the sender to send it again." } else { "This drawing is empty: there is nothing to clean." };
        warnings.push(msg.into()); blocking = Some(msg.into());
    }
    if u == 0 { warnings.push("Units are not set (Unitless). Confirm inches or millimeters before scaling or sending to a machine; a 25.4x error is common.".into()); }
    else if !(0..=20).contains(&u) { warnings.push(format!("Units code {u} is not a real unit (Unknown). Confirm inches or millimeters before scaling or sending to a machine; a 25.4x error is common.")); }
    if splines + ellipses > 0 { warnings.push(format!("{} splines/ellipses. Many laser and CNC controllers need these as arcs and lines: use the CNC export (R12).", splines + ellipses)); }
    let nonstd = fonts.iter().filter(|f| f["standard"] == false).count();
    if nonstd > 0 { warnings.push(format!("{nonstd} text style(s) use fonts other people may not have. They'll see substituted fonts.")); }
    if xrefs.iter().any(|x| x["absolute"] == true) { warnings.push("Some references use full folder paths. They break when the file is sent to someone else.".into()); }
    json!({
        "version": format!("{:?}", doc.version), "bytes": size, "units": units, "units_code": u,
        "entities": total, "by_type": types, "objects": object_counts(doc), "text_entities": text,
        "layers": doc.layers.iter().map(|l| l.name.clone()).collect::<Vec<_>>(),
        "fonts": fonts, "xrefs": xrefs, "warnings": warnings, "blocking": blocking,
    })
}

/// Full report for raw bytes: inspection + recovery notes + invalid-number count.
pub fn inspect_bytes(bytes: &[u8]) -> Result<Value, String> {
    let (doc, notes) = read_with_notes(bytes)?;
    let mut v = inspect_doc(&doc, bytes.len());
    let bad = count_nonfinite(bytes);
    let w = v["warnings"].as_array_mut().unwrap();
    for n in notes.iter().rev() { w.insert(0, Value::String(n.clone())); }
    if bad > 0 { w.push(Value::String(format!("{bad} coordinate value(s) were not real numbers (like 1e400 or NaN). CAD apps set them to 0, which moves those points to the origin. Check the drawing before you send it."))); }
    v["invalid_numbers"] = json!(bad); v["recovered"] = json!(!notes.is_empty());
    Ok(v)
}

pub fn clean_doc(mut doc: CadDocument, target: &str, units: i16) -> Result<Vec<u8>, String> {
    if doc.entities().next().is_none() { return Err("Nothing to save: this drawing has no objects. If it should have some, the file is cut off or damaged; ask the sender to send it again.".into()); }
    for b in doc.block_records.iter_mut() {
        if !b.xref_path.is_empty() { let f = b.xref_path.rsplit(['/', '\\']).next().unwrap_or("").to_string(); b.xref_path = f; }
    }
    if units >= 0 { doc.header.insertion_units = units; }
    let ver = match target { "r12" | "cnc" => DxfVersion::AC1009, "r14" => DxfVersion::AC1014, "r2000" => DxfVersion::AC1015, _ => DxfVersion::AC1032 };
    if target == "dwg" {
        doc.version = DxfVersion::AC1032;
        // The DWG writer can panic on some inputs; turn that into a plain error instead of crashing.
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| acadrust::io::dwg::DwgWriter::write_to_vec(&doc)));
        return match r { Ok(Ok(v)) => Ok(v), Ok(Err(e)) => Err(format!("Could not write DWG: {}", plain_error(&e.to_string()))), Err(_) => Err("Could not write DWG: this drawing has objects DWG 2018 can't hold yet. Save as DXF 2018 instead.".into()) };
    }
    DxfWriter::new(&doc).with_version(ver).write_to_vec().map_err(|e| format!("Could not write DXF: {}", plain_error(&e.to_string())))
}

/// What will be lost: clean in memory, read the copy back, and compare entity and object counts by type.
pub fn loss_report(bytes: &[u8], target: &str, units: i16) -> Value {
    let (doc, _) = match read_with_notes(bytes) { Ok(d) => d, Err(e) => return json!({ "ok": false, "error": e }) };
    let before = type_counts(&doc); let before_obj = object_counts(&doc);
    let out = match clean_doc(doc, target, units) { Ok(o) => o, Err(e) => return json!({ "ok": false, "error": e }) };
    let back = match read(&out) { Ok(d) => d, Err(e) => return json!({ "ok": false, "error": format!("The clean copy could not be read back to check it: {e}") }) };
    let after = type_counts(&back); let after_obj = object_counts(&back);
    let mut rows = vec![]; let mut lost = 0usize;
    let mut row = |group: &str, k: &String, b: usize, a: usize, lost: &mut usize| {
        let status = if b > 0 && a == 0 { "dropped" } else if a < b { "reduced" } else if b == 0 && a > 0 { "added" } else { "kept" };
        if status == "dropped" || status == "reduced" { *lost += b - a; }
        rows.push(json!({ "group": group, "type": k, "before": b, "after": a, "status": status }));
    };
    let keys: std::collections::BTreeSet<&String> = before.keys().chain(after.keys()).collect();
    for k in keys { row("object", k, *before.get(k).unwrap_or(&0), *after.get(k).unwrap_or(&0), &mut lost); }
    let okeys: std::collections::BTreeSet<&String> = before_obj.keys().chain(after_obj.keys()).collect();
    for k in okeys { row("data", k, *before_obj.get(k).unwrap_or(&0), *after_obj.get(k).unwrap_or(&0), &mut lost); }
    json!({ "ok": true, "target": target, "bytes": out.len(), "rows": rows, "lost": lost,
        "converted": rows.iter().any(|r| r["status"] == "added") })
}

/// Site plan from the permit app as a real DXF 2018: units set to inches, closed polylines,
/// true aligned DIMENSION entities and text, on US National CAD Standard layer names.
/// Input JSON (inches): { outlines: [{layer, pts:[[x,y]..]}], dims: [{layer, a:[x,y], b:[x,y], offset, text?}], texts: [{layer, x, y, h, text}] }
pub fn site_plan(spec: &str) -> Result<Vec<u8>, String> {
    let v: Value = serde_json::from_str(spec).map_err(|e| format!("bad site plan data: {e}"))?;
    let mut doc = CadDocument::new();
    doc.header.insertion_units = 1; // inches
    doc.header.measurement = 0; // imperial
    for (n, c) in [("C-PROP", 7), ("A-EXST-BLDG", 8), ("A-ADU-WALL", 1), ("C-PROP-SETB", 3), ("A-ANNO-DIMS", 5), ("G-ANNO-TEXT", 7)] {
        let mut l = Layer::new(n); l.color = acadrust::types::Color::from_index(c); let _ = doc.layers.add(l);
    }
    let f = |x: &Value| x.as_f64().filter(|v| v.is_finite()).ok_or_else(|| "site plan has a number that is not finite".to_string());
    for o in v["outlines"].as_array().into_iter().flatten() {
        let pts: Result<Vec<Vector2>, String> = o["pts"].as_array().into_iter().flatten().map(|p| Ok(Vector2::new(f(&p[0])?, f(&p[1])?))).collect();
        let mut pl = LwPolyline::from_points(pts?); pl.is_closed = true;
        let mut e = EntityType::LwPolyline(pl); e.common_mut().layer = o["layer"].as_str().unwrap_or("0").to_string();
        doc.add_entity(e).map_err(|e| e.to_string())?;
    }
    for d in v["dims"].as_array().into_iter().flatten() {
        let a = Vector3::new(f(&d["a"][0])?, f(&d["a"][1])?, 0.0); let b = Vector3::new(f(&d["b"][0])?, f(&d["b"][1])?, 0.0);
        if a.distance(&b) < 1e-6 { continue; }
        let mut dim = DimensionAligned::new(a, b); dim.set_offset(d["offset"].as_f64().unwrap_or(24.0));
        if let Some(t) = d["text"].as_str() { dim.base.set_text_override(Some(t.to_string())); }
        let mut e = EntityType::Dimension(Box::new(Dimension::Aligned(dim))); e.common_mut().layer = d["layer"].as_str().unwrap_or("A-ANNO-DIMS").to_string();
        doc.add_entity(e).map_err(|e| e.to_string())?;
    }
    for t in v["texts"].as_array().into_iter().flatten() {
        let tx = Text::with_value(t["text"].as_str().unwrap_or(""), Vector3::new(f(&t["x"])?, f(&t["y"])?, 0.0)).with_height(t["h"].as_f64().unwrap_or(9.0));
        let mut e = EntityType::Text(tx); e.common_mut().layer = t["layer"].as_str().unwrap_or("G-ANNO-TEXT").to_string();
        doc.add_entity(e).map_err(|e| e.to_string())?;
    }
    DxfWriter::new(&doc).with_version(DxfVersion::AC1032).write_to_vec().map_err(|e| e.to_string())
}

#[wasm_bindgen] pub fn inspect(bytes: &[u8]) -> Result<String, JsValue> { inspect_bytes(bytes).map(|v| v.to_string()).map_err(|e| JsValue::from_str(&e)) }
#[wasm_bindgen] pub fn clean(bytes: &[u8], target: &str, units: i16) -> Result<Vec<u8>, JsValue> { let d = read(bytes).map_err(|e| JsValue::from_str(&e))?; clean_doc(d, target, units).map_err(|e| JsValue::from_str(&e)) }
#[wasm_bindgen] pub fn loss(bytes: &[u8], target: &str, units: i16) -> String { loss_report(bytes, target, units).to_string() }
#[wasm_bindgen] pub fn site_plan_dxf(spec: &str) -> Result<Vec<u8>, JsValue> { site_plan(spec).map_err(|e| JsValue::from_str(&e)) }
