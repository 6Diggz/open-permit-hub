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
    if let Some(p) = dxf_preflight(bytes) { return Err(p); }
    // The reader can panic on damaged tables; on native builds turn that into a plain error (WASM aborts, so the preflight above matters).
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| DxfReader::from_reader(Cursor::new(bytes.to_vec())).map_err(|e| e.to_string())?.read().map_err(|e| e.to_string()))) {
        Ok(r) => r,
        Err(_) => Err("invalid dxf: the reader stopped on a damaged table".into()),
    }
}

/// (group code, value) pairs of an ASCII DXF, and the section and object each pair is in.
fn dxf_pairs(bytes: &[u8]) -> Option<Vec<(i32, String, String, String)>> {
    if is_dwg(bytes) || bytes.starts_with(b"AutoCAD Binary DXF") { return None; }
    let text = std::str::from_utf8(bytes).ok()?;
    let mut it = text.lines(); let mut out = vec![]; let (mut sec, mut obj) = (String::new(), String::new()); let mut want_name = false;
    while let (Some(c), Some(v)) = (it.next(), it.next()) {
        let Ok(code) = c.trim().parse::<i32>() else { return Some(out) };
        let v = v.trim().to_string();
        if code == 0 { if v == "SECTION" { want_name = true; } else if v == "ENDSEC" { sec.clear(); } obj = v.clone(); }
        else if code == 2 && want_name { sec = v.clone(); want_name = false; }
        out.push((code, v, sec.clone(), obj.clone()));
    }
    Some(out)
}

/// Damaged counts that make the CAD reader stop (a negative line type dash count, vertex count, loop count).
pub fn dxf_preflight(bytes: &[u8]) -> Option<String> {
    let pairs = dxf_pairs(bytes)?;
    for (code, v, _sec, obj) in &pairs {
        let neg = v.parse::<i64>().map(|n| n < 0).unwrap_or(false);
        let count_code = matches!((obj.as_str(), *code), ("LTYPE", 73) | ("LWPOLYLINE", 90) | ("HATCH", 91) | ("HATCH", 93) | ("SPLINE", 72) | ("SPLINE", 73) | ("SPLINE", 74));
        if neg && count_code { return Some(format!("This file is damaged: its {obj} data has a negative count (group {code}). Open it in the sender's CAD app and run Recover, or ask for a new copy.")); }
    }
    None
}

/// Entity names in the ENTITIES section, counted straight from the file text (before any reader can skip them).
pub fn raw_entity_counts(bytes: &[u8]) -> Option<BTreeMap<String, usize>> {
    let pairs = dxf_pairs(bytes)?; let mut m: BTreeMap<String, usize> = BTreeMap::new();
    for (code, v, sec, _) in &pairs { if *code == 0 && sec == "ENTITIES" && !matches!(v.as_str(), "ENDSEC" | "VERTEX" | "SEQEND" | "ATTRIB" | "SECTION") { *m.entry(v.clone()).or_default() += 1; } }
    Some(m)
}
/// The reader's type names for a DXF entity name (POLYLINE can come back as several kinds).
fn raw_aliases(dxf: &str) -> Vec<String> {
    let n = dxf.to_lowercase().replace(|c: char| !c.is_ascii_alphanumeric(), "");
    match n.as_str() {
        "3dface" => vec!["face3d".into()], "3dsolid" => vec!["solid3d".into()], "attdef" => vec!["attributedefinition".into()],
        "polyline" => vec!["polyline".into(), "polyline2d".into(), "polyline3d".into(), "polyfacemesh".into(), "polygonmesh".into()],
        "mleader" | "multileader" => vec!["multileader".into()], "arcdimension" | "largeradialdimension" => vec!["dimension".into()], "trace" => vec!["solid".into(), "trace".into()], "image" => vec!["rasterimage".into()], "acadtable" => vec!["table".into()],
        "pdfunderlay" | "dwfunderlay" | "dgnunderlay" => vec!["underlay".into(), n.clone()],
        _ if n.ends_with("surface") => vec!["surface".into(), n.clone()],
        _ => vec![n],
    }
}
fn norm_kind(k: &str) -> String { k.to_lowercase().replace(|c: char| !c.is_ascii_alphanumeric(), "") }
/// Types the reader skipped: counted in the file text but missing (or fewer) after reading.
pub fn dropped_on_read(bytes: &[u8], parsed: &BTreeMap<String, usize>) -> Vec<(String, usize, usize)> {
    let Some(raw) = raw_entity_counts(bytes) else { return vec![] };
    // Types the reader keeps without knowing them come back as Unknown or Extended: those absorb unmatched names first.
    let mut pool: usize = ["Unknown", "Extended"].iter().map(|k| *parsed.get(*k).unwrap_or(&0)).sum();
    raw.into_iter().filter_map(|(name, n)| {
        let al = raw_aliases(&name);
        let mut got: usize = parsed.iter().filter(|(k, _)| al.contains(&norm_kind(k))).map(|(_, v)| *v).sum();
        if got < n { let take = pool.min(n - got); pool -= take; got += take; }
        if got < n { Some((name, n, got)) } else { None }
    }).collect()
}

/// Sample a spline (rational NURBS via de Boor) or ellipse into points, for formats that can't hold curves (R12).
fn sample_curve(e: &EntityType) -> Option<(Vec<Vector2>, bool)> {
    match e {
        EntityType::Spline(sp) => {
            let p = sp.degree.max(1) as usize; let cp = &sp.control_points; let n = cp.len();
            if n >= p + 1 && sp.knots.len() == n + p + 1 {
                let k = &sp.knots; let w = |i: usize| if sp.weights.len() == n && sp.weights[i] > 0.0 { sp.weights[i] } else { 1.0 };
                let (t0, t1) = (k[p], k[n]); if !(t1 > t0) { return None; }
                let segs = (n * 16).clamp(32, 2000); let mut pts = vec![];
                for s in 0..=segs {
                    let t = if s == segs { t1 - 1e-12 * (t1 - t0) } else { t0 + (t1 - t0) * s as f64 / segs as f64 };
                    let mut span = p; while span < n - 1 && t >= k[span + 1] { span += 1; }
                    let mut d: Vec<[f64; 3]> = (0..=p).map(|j| { let i = span - p + j; let wi = w(i); [cp[i].x * wi, cp[i].y * wi, wi] }).collect();
                    for r in 1..=p { for j in (r..=p).rev() { let i = span - p + j; let den = k[i + p - r + 1] - k[i]; let a = if den.abs() < 1e-15 { 0.0 } else { (t - k[i]) / den };
                        for c in 0..3 { d[j][c] = (1.0 - a) * d[j - 1][c] + a * d[j][c]; } } }
                    let q = d[p]; if q[2].abs() < 1e-15 { return None; } pts.push(Vector2::new(q[0] / q[2], q[1] / q[2]));
                }
                Some((pts, sp.flags.closed))
            } else if sp.fit_points.len() >= 2 { Some((sp.fit_points.iter().map(|v| Vector2::new(v.x, v.y)).collect(), sp.flags.closed)) } else { None }
        }
        EntityType::Ellipse(el) => {
            let mj = el.major_axis; let nz = if el.normal.z < 0.0 { -1.0 } else { 1.0 };
            let mn = (-mj.y * nz * el.minor_axis_ratio, mj.x * nz * el.minor_axis_ratio);
            let (a0, mut a1) = (el.start_parameter, el.end_parameter); if a1 <= a0 { a1 += std::f64::consts::TAU; }
            let full = (a1 - a0 - std::f64::consts::TAU).abs() < 1e-9; let segs = 128;
            let pts = (0..=segs).map(|s| { let t = a0 + (a1 - a0) * s as f64 / segs as f64; Vector2::new(el.center.x + t.cos() * mj.x + t.sin() * mn.0, el.center.y + t.cos() * mj.y + t.sin() * mn.1) }).collect();
            Some((pts, full))
        }
        _ => None,
    }
}
/// R12 can't hold splines or ellipses: replace each with a polyline through points on the curve (same layer, color, handle).
pub fn approximate_curves(doc: &mut CadDocument) -> usize {
    let mut n = 0;
    for e in doc.entities_mut() {
        if let Some((pts, closed)) = sample_curve(e) {
            if pts.len() < 2 || pts.iter().any(|p| !p.x.is_finite() || !p.y.is_finite()) { continue; }
            let mut pl = LwPolyline::from_points(pts); pl.is_closed = closed; pl.common = e.common().clone();
            *e = EntityType::LwPolyline(pl); n += 1;
        }
    }
    n
}

/// Cleaning passes (like AutoCAD OVERKILL for the simple cases): zero-length lines and exact duplicate lines, circles
/// and points on the same layer with the same color are removed. Returns how many of each type were removed.
pub fn tidy(doc: &mut CadDocument) -> BTreeMap<String, usize> {
    let r = |v: f64| format!("{:.9}", v); let mut seen = std::collections::HashSet::new(); let mut drop = vec![];
    for e in doc.entities() {
        let c = e.common(); let base = format!("{}|{:?}|{:?}", c.layer, c.color, c.linetype);
        let key = match e {
            EntityType::Line(l) => { let (a, b) = ((r(l.start.x), r(l.start.y), r(l.start.z)), (r(l.end.x), r(l.end.y), r(l.end.z)));
                if a == b { drop.push((c.handle, "Line".to_string())); continue; } let (p, q) = if a <= b { (a, b) } else { (b, a) }; Some(format!("L|{base}|{p:?}|{q:?}|{}", r(l.thickness))) }
            EntityType::Circle(k) => Some(format!("C|{base}|{} {} {} {}", r(k.center.x), r(k.center.y), r(k.center.z), r(k.radius))),
            EntityType::Point(p) => Some(format!("P|{base}|{} {} {}", r(p.location.x), r(p.location.y), r(p.location.z))),
            _ => None,
        };
        if let Some(k) = key { if !seen.insert(k) { drop.push((c.handle, kind(e))); } }
    }
    let mut out: BTreeMap<String, usize> = BTreeMap::new();
    for (h, k) in drop { if doc.remove_entity(h).is_some() { *out.entry(k).or_default() += 1; } }
    out
}

/// Geometry fingerprint per entity: type, layer, rounded extents and text. Compared before/after to catch moved points or blanked text.
fn fingerprints(doc: &CadDocument) -> BTreeMap<String, BTreeMap<String, usize>> {
    let mut m: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    for e in doc.entities() {
        let b = e.as_entity().bounding_box(); let r = |v: f64| if v.is_finite() { format!("{:.3}", v) } else { "x".into() };
        let txt = match e { EntityType::Text(t) => t.value.clone(), EntityType::MText(t) => t.value.clone(), _ => String::new() };
        let key = format!("{}|{} {} {} {}|{}", e.common().layer, r(b.min.x), r(b.min.y), r(b.max.x), r(b.max.y), txt);
        *m.entry(kind(e)).or_default().entry(key).or_default() += 1;
    }
    m
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
                        let seen: Vec<String> = dxf_pairs(bytes).unwrap_or_default().into_iter().filter(|(c, v, _, o)| *c == 2 && o == "SECTION" && !v.is_empty()).map(|(_, v, _, _)| v).collect();
                        let missing: Vec<&str> = ["HEADER", "CLASSES", "TABLES", "BLOCKS", "ENTITIES", "OBJECTS"].into_iter().filter(|x| !seen.iter().any(|s| s == x)).collect();
                        let at = seen.last().map(|s| s.as_str()).unwrap_or("the start");
                        let miss = if missing.is_empty() { String::new() } else { format!(" Sections that never arrived: {}.", missing.join(", ")) };
                        return Ok((d, vec![format!("Recovered, but incomplete: this file is cut off. It stops inside the {at} section with no end-of-file marker, so everything after that point is missing and can't be counted (an unfinished object of {dropped} lines was skipped).{miss} Ask the sender for a full copy.")]));
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
    if splines + ellipses > 0 { warnings.push(format!("{} splines/ellipses. Many laser and CNC controllers can't read curves like these. The CNC export (R12) writes each one as a polyline through points on the curve (close, not exact).", splines + ellipses)); }
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
    if matches!(target, "r12" | "cnc") { approximate_curves(&mut doc); }
    tidy(&mut doc);
    let ver = match target { "r12" | "cnc" => DxfVersion::AC1009, "r14" => DxfVersion::AC1014, "r2000" => DxfVersion::AC1015, _ => DxfVersion::AC1032 };
    if target == "dwg" {
        doc.version = DxfVersion::AC1032;
        // The DWG writer can panic on some inputs; turn that into a plain error instead of crashing.
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| acadrust::io::dwg::DwgWriter::write_to_vec(&doc)));
        return match r { Ok(Ok(v)) => Ok(v), Ok(Err(e)) => Err(format!("Could not write DWG: {}", plain_error(&e.to_string()))), Err(_) => Err("Could not write DWG: this drawing has objects DWG 2018 can't hold yet. Save as DXF 2018 instead.".into()) };
    }
    DxfWriter::new(&doc).with_version(ver).write_to_vec().map_err(|e| format!("Could not write DXF: {}", plain_error(&e.to_string())))
}

/// Entities whose geometry or text differs between two drawings (same type, different layer, extents or text).
pub fn fingerprint_diff(a: &CadDocument, b: &CadDocument) -> usize {
    let (x, y) = (fingerprints(a), fingerprints(b)); let mut n = 0;
    for (k, m) in &x { for (key, c) in m { n += c.saturating_sub(*y.get(k).and_then(|z| z.get(key)).unwrap_or(&0)); } }
    n
}
/// Hidden object types (dictionaries, records, styles): shown apart from the things you can see, and not in the headline count.
fn plain_type(k: &str) -> String {
    match k { "Unknown" => "Unnamed data the reader did not recognize".into(), "ClassObject" => "Class definition".into(), "XRecord" => "Extension record (app data)".into(), _ => k.to_string() }
}
/// What will be lost: clean in memory, read the copy back, and compare by type and by geometry.
/// Before counts include what the reader skipped (counted from the file text). Converted types (a polyline written in an
/// older form, a spline written as a polyline) are paired, not counted as lost. Hidden data is listed apart.
pub fn loss_report(bytes: &[u8], target: &str, units: i16) -> Value {
    let (mut doc, notes) = match read_with_notes(bytes) { Ok(d) => d, Err(e) => return json!({ "ok": false, "error": e }) };
    let incomplete = !notes.is_empty();
    let mut before = type_counts(&doc); let before_obj = object_counts(&doc);
    let skipped = dropped_on_read(bytes, &before);
    let r12 = matches!(target, "r12" | "cnc");
    let approx = if r12 { approximate_curves(&mut doc) } else { 0 };
    let cleaned = tidy(&mut doc);
    let fp_before = fingerprints(&doc);
    let out = match clean_doc(doc, target, units) { Ok(o) => o, Err(e) => return json!({ "ok": false, "error": e }) };
    let back = match read(&out) { Ok(d) => d, Err(e) => return json!({ "ok": false, "error": format!("The clean copy could not be read back to check it: {e}") }) };
    let after = type_counts(&back); let after_obj = object_counts(&back); let fp_after = fingerprints(&back);
    // Spline/Ellipse rows: show the original counts (they were replaced by polylines just above).
    let orig = type_counts(&read_with_notes(bytes).map(|x| x.0).unwrap_or_else(|_| CadDocument::new()));
    for k in ["Spline", "Ellipse"] { if let Some(v) = orig.get(k) { before.insert(k.into(), *v); } }
    let mut rows = vec![]; let (mut lost, mut hidden_lost, mut changed) = (0usize, 0usize, 0usize);
    for (name, n, got) in &skipped { lost += n - got; rows.push(json!({ "group": "object", "type": name, "before": n, "after": got, "status": "dropped_on_read" })); }
    // Pair conversions: LwPolyline written as Polyline2D in old formats, Spline/Ellipse written as polylines.
    let poly_in = *before.get("LwPolyline").unwrap_or(&0) + approx; let poly_out = *after.get("LwPolyline").unwrap_or(&0) + *after.get("Polyline2D").unwrap_or(&0);
    let poly_converted = r12 && poly_out >= poly_in && poly_in > 0;
    let keys: std::collections::BTreeSet<&String> = before.keys().chain(after.keys()).collect();
    for k in keys {
        let (b, a) = (*before.get(k).unwrap_or(&0), *after.get(k).unwrap_or(&0));
        let curve = r12 && (k == "Spline" || k == "Ellipse") && approx > 0;
        let conv = poly_converted && (k == "LwPolyline" || k == "Polyline2D");
        let tidied = *cleaned.get(k).unwrap_or(&0);
        let status = if curve { "approximated" } else if conv { "converted" } else if tidied > 0 && b >= a && b - a <= tidied { "cleaned" } else if b > 0 && a == 0 { "dropped" } else if a < b { "reduced" } else if b == 0 && a > 0 { "added" } else { "kept" };
        if status == "dropped" || status == "reduced" { lost += b - a; }
        // Same count but different geometry or text: "changed".
        let mut ch = 0; if status == "kept" { if let (Some(x), Some(y)) = (fp_before.get(k), fp_after.get(k)) { for (key, n) in x { ch += n.saturating_sub(*y.get(key).unwrap_or(&0)); } } }
        changed += ch;
        rows.push(json!({ "group": "object", "type": k, "before": b, "after": a, "status": if ch > 0 { "changed" } else { status }, "changed": ch }));
    }
    let okeys: std::collections::BTreeSet<&String> = before_obj.keys().chain(after_obj.keys()).collect();
    for k in okeys {
        let (b, a) = (*before_obj.get(k).unwrap_or(&0), *after_obj.get(k).unwrap_or(&0));
        let status = if b > 0 && a == 0 { "dropped" } else if a < b { "reduced" } else if b == 0 && a > 0 { "added" } else { "kept" };
        if status == "dropped" || status == "reduced" { hidden_lost += b - a; }
        rows.push(json!({ "group": "data", "type": plain_type(k), "before": b, "after": a, "status": status }));
    }
    let best = if lost + changed == 0 { true } else { target == "r2018" };
    json!({ "ok": true, "target": target, "bytes": out.len(), "rows": rows, "lost": lost, "hidden_lost": hidden_lost, "changed": changed,
        "approximated": approx, "cleaned": cleaned, "incomplete": incomplete, "notes": notes, "best_format": best,
        "converted": rows.iter().any(|r| r["status"] == "added" || r["status"] == "converted" || r["status"] == "approximated") })
}

/// Site plan from the permit app as a real DXF 2018: units set to inches, closed polylines,
/// true aligned DIMENSION entities and text, on US National CAD Standard layer names.
/// Input JSON (inches): { outlines: [{layer, pts:[[x,y]..]}], dims: [{layer, a:[x,y], b:[x,y], offset, text?}], texts: [{layer, x, y, h, text}] }
pub fn site_plan(spec: &str) -> Result<Vec<u8>, String> {
    let v: Value = serde_json::from_str(spec).map_err(|e| format!("bad site plan data: {e}"))?;
    let mut doc = CadDocument::new();
    doc.header.insertion_units = 1; // inches
    doc.header.measurement = 0; // imperial
    for (n, c) in [("C-PROP", 7), ("A-EXST-BLDG", 8), ("A-ADU-WALL", 1), ("C-PROP-SETB", 3), ("A-ANNO-DIMS", 5), ("G-ANNO-TEXT", 7), ("A-AREA", 4), ("A-AREA-IDEN", 4), ("A-DOOR", 2), ("A-GLAZ", 5), ("G-ANNO-REDL", 1)] {
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
