//! Clean and Fix (Layer 2 MVP). Never touches the original: reads bytes, returns a report and a clean copy.
use acadrust::types::DxfVersion;
use acadrust::{CadDocument, DwgReader, DxfReader, DxfWriter};
use acadrust::entities::EntityType;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

const UNITS: [&str; 21] = ["Unitless","Inches","Feet","Miles","Millimeters","Centimeters","Meters","Kilometers","Microinches","Mils","Yards","Angstroms","Nanometers","Microns","Decimeters","Decameters","Hectometers","Gigameters","Astronomical units","Light years","Parsecs"];
const STD_FONTS: [&str; 8] = ["txt", "simplex", "romans", "arial", "isocp", "romand", "complex", "monotxt"];

fn is_dwg(b: &[u8]) -> bool { b.len() > 6 && &b[0..2] == b"AC" && b[2..6].iter().all(|c| c.is_ascii_digit()) }

pub fn read(bytes: &[u8]) -> Result<CadDocument, String> {
    if is_dwg(bytes) { DwgReader::from_stream(Cursor::new(bytes.to_vec())).read().map_err(|e| format!("Could not read DWG: {e}")) }
    else { DxfReader::from_reader(Cursor::new(bytes.to_vec())).map_err(|e| format!("Could not read DXF: {e}"))?.read().map_err(|e| format!("Could not read DXF: {e}")) }
}

fn kind(e: &EntityType) -> String { let d = format!("{e:?}"); d.split(|c: char| c == '(' || c == ' ' || c == '{').next().unwrap_or("Unknown").to_string() }

pub fn inspect_doc(doc: &CadDocument, size: usize) -> Value {
    let mut types: BTreeMap<String, usize> = BTreeMap::new();
    let (mut splines, mut ellipses, mut text, mut total) = (0, 0, 0, 0);
    for e in doc.entities() {
        total += 1; let k = kind(e); *types.entry(k.clone()).or_default() += 1;
        match e { EntityType::Spline(_) => splines += 1, EntityType::Ellipse(_) => ellipses += 1, _ => {} }
        if k.contains("Text") { text += 1; }
    }
    let fonts: Vec<Value> = doc.text_styles.iter().map(|s| {
        let file = if !s.true_type_font.is_empty() { s.true_type_font.clone() } else { s.font_file.clone() };
        let base = file.to_lowercase().rsplit(['/', '\\']).next().unwrap_or("").trim_end_matches(".shx").trim_end_matches(".ttf").to_string();
        json!({ "style": s.name, "font": file, "standard": base.is_empty() || STD_FONTS.contains(&base.as_str()), "bigfont": s.big_font_file })
    }).collect();
    let xrefs: Vec<Value> = doc.block_records.iter().filter(|b| !b.xref_path.is_empty()).map(|b| {
        let abs = b.xref_path.contains(':') || b.xref_path.starts_with('/') || b.xref_path.starts_with("\\\\");
        json!({ "name": b.name, "path": b.xref_path, "absolute": abs, "fix": if abs { "Will be rewritten to a relative path (file name only)" } else { "OK (relative)" } })
    }).collect();
    let u = doc.header.insertion_units; let units = UNITS.get(u as usize).copied().unwrap_or("Unknown");
    let mut warnings: Vec<String> = vec![];
    if u == 0 { warnings.push("Units are not set (Unitless). Confirm inches or millimeters before scaling or sending to a machine; a 25.4x error is common.".into()); }
    if splines + ellipses > 0 { warnings.push(format!("{} splines/ellipses. Many laser and CNC controllers need these as arcs and lines: use the CNC export (R12).", splines + ellipses)); }
    let nonstd = fonts.iter().filter(|f| f["standard"] == false).count();
    if nonstd > 0 { warnings.push(format!("{nonstd} text style(s) use fonts other people may not have. They'll see substituted fonts.")); }
    if xrefs.iter().any(|x| x["absolute"] == true) { warnings.push("Some references use full folder paths. They break when the file is sent to someone else.".into()); }
    json!({
        "version": format!("{:?}", doc.version), "bytes": size, "units": units, "units_code": u,
        "entities": total, "by_type": types, "text_entities": text,
        "layers": doc.layers.iter().map(|l| l.name.clone()).collect::<Vec<_>>(),
        "fonts": fonts, "xrefs": xrefs, "warnings": warnings,
    })
}

pub fn clean_doc(mut doc: CadDocument, target: &str, units: i16) -> Result<Vec<u8>, String> {
    for b in doc.block_records.iter_mut() {
        if !b.xref_path.is_empty() { let f = b.xref_path.rsplit(['/', '\\']).next().unwrap_or("").to_string(); b.xref_path = f; }
    }
    if units >= 0 { doc.header.insertion_units = units; }
    let ver = match target { "r12" | "cnc" => DxfVersion::AC1009, "r14" => DxfVersion::AC1014, "r2000" => DxfVersion::AC1015, _ => DxfVersion::AC1032 };
    if target == "dwg" { doc.version = DxfVersion::AC1032; return acadrust::io::dwg::DwgWriter::write_to_vec(&doc).map_err(|e| format!("Could not write DWG: {e}")); }
    DxfWriter::new(&doc).with_version(ver).write_to_vec().map_err(|e| format!("Could not write DXF: {e}"))
}

#[wasm_bindgen] pub fn inspect(bytes: &[u8]) -> Result<String, JsValue> { let d = read(bytes).map_err(|e| JsValue::from_str(&e))?; Ok(inspect_doc(&d, bytes.len()).to_string()) }
#[wasm_bindgen] pub fn clean(bytes: &[u8], target: &str, units: i16) -> Result<Vec<u8>, JsValue> { let d = read(bytes).map_err(|e| JsValue::from_str(&e))?; clean_doc(d, target, units).map_err(|e| JsValue::from_str(&e)) }
