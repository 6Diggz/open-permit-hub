//! Cleaning operations (OUT2-13): purge unused table entries, overkill, zero-length removal, empty text removal and an
//! audit. Every operation reports a before/after count and what it removed. They only ever run on an in-memory copy;
//! the original file is never changed, so "undo" is simply running again with that operation switched off.
use acadrust::entities::EntityType;
use acadrust::tables::{Layer, LineType, TextStyle};
use acadrust::types::{Handle, Vector3};
use acadrust::CadDocument;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

/// Which cleaning operations to run. Every one defaults to on; a missing key in the JSON means on.
#[derive(Clone, Debug, PartialEq)]
pub struct CleanOpts { pub purge: bool, pub overkill: bool, pub zero: bool, pub empty_text: bool, pub audit: bool }
impl Default for CleanOpts { fn default() -> Self { Self { purge: true, overkill: true, zero: true, empty_text: true, audit: true } } }
impl CleanOpts {
    /// Parse `{"purge":false,...}`. Bad JSON falls back to the defaults (all on).
    pub fn from_json(s: &str) -> Self {
        let v: Value = serde_json::from_str(s).unwrap_or(Value::Null); let d = Self::default();
        let g = |k: &str, dv: bool| v.get(k).and_then(|x| x.as_bool()).unwrap_or(dv);
        Self { purge: g("purge", d.purge), overkill: g("overkill", d.overkill), zero: g("zero", d.zero), empty_text: g("empty_text", d.empty_text), audit: g("audit", d.audit) }
    }
    pub fn none() -> Self { Self { purge: false, overkill: false, zero: false, empty_text: false, audit: false } }
}

/// Result of the cleaning passes: one row per operation, and how many drawing objects of each type were removed
/// (so the loss report lists them as "Removed by cleaning", never as lost).
#[derive(Debug, Default)]
pub struct CleanRun { pub ops: Vec<Value>, pub removed: BTreeMap<String, usize>, pub audit: Value }

/// Names that are never purged, whatever the reference map says (AutoCAD can't purge them either).
fn protected(table: &str, name: &str) -> bool {
    let n = name.to_lowercase();
    if n.is_empty() || n.contains('|') { return true; } // xref-dependent entries belong to the other file
    match table {
        "layer" => n == "0" || n == "defpoints",
        "linetype" => n == "bylayer" || n == "byblock" || n == "continuous",
        "style" => n == "standard" || n == "annotative",
        "block" => n.starts_with('*'),
        _ => true,
    }
}

/// Every quoted string and every handle number in a record's debug form. This is the conservative reference map:
/// a table entry counts as used if its name or its handle appears anywhere in any other record, in any field.
fn tokens_of(dbg: &str, out: &mut HashSet<String>) {
    let b = dbg.as_bytes(); let mut i = 0;
    while i < b.len() {
        if b[i] == b'"' {
            let mut j = i + 1; let mut esc = false;
            while j < b.len() { if esc { esc = false; } else if b[j] == b'\\' { esc = true; } else if b[j] == b'"' { break; } j += 1; }
            out.insert(format!("s:{}", dbg[i + 1..j.min(b.len())].to_lowercase())); i = j + 1; continue;
        }
        if b[i] == b'H' && dbg[i..].starts_with("Handle(") {
            let k = i + 7; let mut j = k; while j < b.len() && b[j].is_ascii_digit() { j += 1; }
            if j > k { out.insert(format!("h:{}", &dbg[k..j])); } i = j; continue;
        }
        i += 1;
    }
}
fn name_token(name: &str) -> String { let q = format!("{name:?}"); format!("s:{}", q[1..q.len() - 1].to_lowercase()) }
fn handle_token(h: Handle) -> String { let d = format!("{h:?}"); format!("h:{}", d.trim_start_matches("Handle(").trim_end_matches(')')) }

/// The reference map of a document: token -> how many records hold it, per source, so a candidate can subtract itself.
struct RefMap { by_owner: HashMap<Handle, HashSet<String>>, others: HashMap<String, usize>, self_sets: HashMap<(String, String), HashSet<String>> }
impl RefMap {
    fn build(doc: &CadDocument) -> Self {
        let mut by_owner: HashMap<Handle, HashSet<String>> = HashMap::new();
        for e in doc.entities() { tokens_of(&format!("{e:?}"), by_owner.entry(e.common().owner_handle).or_default()); }
        let mut others: HashMap<String, usize> = HashMap::new(); let mut self_sets = HashMap::new();
        let add = |set: HashSet<String>, others: &mut HashMap<String, usize>| { for t in set { *others.entry(t).or_default() += 1; } };
        for o in doc.objects.values() { let mut s = HashSet::new(); tokens_of(&format!("{o:?}"), &mut s); add(s, &mut others); }
        { let mut s = HashSet::new(); tokens_of(&format!("{:?}", doc.header), &mut s); add(s, &mut others); }
        macro_rules! table { ($t:expr, $tag:expr) => { for x in $t.iter() { let mut s = HashSet::new(); tokens_of(&format!("{x:?}"), &mut s); self_sets.insert(($tag.to_string(), x.name.to_lowercase()), s.clone()); add(s, &mut others); } } }
        table!(doc.layers, "layer"); table!(doc.line_types, "linetype"); table!(doc.text_styles, "style"); table!(doc.block_records, "block");
        table!(doc.dim_styles, "dimstyle"); table!(doc.views, "view"); table!(doc.vports, "vport"); table!(doc.ucss, "ucs"); table!(doc.app_ids, "appid");
        Self { by_owner, others, self_sets }
    }
    /// Used anywhere outside the entry itself (and, for a block, outside its own geometry)?
    fn used(&self, table: &str, name: &str, handle: Handle, block_handle: Option<Handle>) -> bool {
        let toks = [name_token(name), handle_token(handle)];
        let mine = self.self_sets.get(&(table.to_string(), name.to_lowercase()));
        for t in &toks {
            let n = *self.others.get(t).unwrap_or(&0); let own = mine.map(|m| m.contains(t) as usize).unwrap_or(0);
            if n > own { return true; }
            if self.by_owner.iter().any(|(o, set)| Some(*o) != block_handle && set.contains(t)) { return true; }
        }
        false
    }
}

/// Remove entities and drop their handles from every block record's list.
fn drop_entities(doc: &mut CadDocument, hs: &[Handle]) -> BTreeMap<String, usize> {
    let mut out: BTreeMap<String, usize> = BTreeMap::new(); let set: HashSet<Handle> = hs.iter().copied().collect();
    for h in hs { if let Some(e) = doc.remove_entity(*h) { *out.entry(crate::kind(&e)).or_default() += 1; } }
    if !set.is_empty() { for b in doc.block_records.iter_mut() { b.entity_handles.retain(|h| !set.contains(h)); } }
    out
}
fn merge(into: &mut BTreeMap<String, usize>, from: BTreeMap<String, usize>) { for (k, v) in from { *into.entry(k).or_default() += v; } }

/// Records this tool can't read: they could reference a name in a way the map can't see, so purge is skipped.
fn unreadable_records(doc: &CadDocument) -> usize {
    doc.entities().filter(|e| matches!(e, EntityType::Unknown(_))).count() + doc.objects.values().filter(|o| crate::obj_kind(o) == "Unknown").count()
}

/// Purge unused blocks, layers, line types and text styles. Blocks go first (an unused block can be the only user of a
/// layer), and repeat until nothing more is free, like running PURGE several times.
pub fn purge_unused(doc: &mut CadDocument, removed: &mut BTreeMap<String, usize>) -> Vec<Value> {
    let counts = |d: &CadDocument| [d.block_records.iter().filter(|b| !b.name.starts_with('*')).count(), d.layers.len(), d.line_types.len(), d.text_styles.len()];
    let before = counts(doc); let mut names: [Vec<String>; 4] = Default::default();
    let unreadable = unreadable_records(doc);
    // A block library (nothing drawn outside block definitions) keeps its blocks: they are the content, not leftovers.
    let spaces: HashSet<Handle> = doc.block_records.iter().filter(|b| { let n = b.name.to_lowercase(); n.starts_with("*model_space") || n.starts_with("*paper_space") }).map(|b| b.handle).collect();
    let blocks: HashSet<Handle> = doc.block_records.iter().map(|b| b.handle).filter(|h| !spaces.contains(h)).collect();
    let library = !doc.entities().any(|e| { let o = e.common().owner_handle; spaces.contains(&o) || !blocks.contains(&o) });
    if unreadable == 0 {
        while !library {
            let m = RefMap::build(doc);
            let free: Vec<(String, Handle, Vec<Handle>)> = doc.block_records.iter()
                .filter(|b| !protected("block", &b.name) && b.xref_path.is_empty() && !b.flags.is_xref && b.layout.value() == 0 && !m.used("block", &b.name, b.handle, Some(b.handle)))
                .map(|b| (b.name.clone(), b.handle, b.entity_handles.clone())).collect();
            if free.is_empty() { break; }
            for (name, _h, ents) in free {
                let (be, ee) = doc.block_records.get(&name).map(|b| (b.block_entity_handle, b.block_end_handle)).unwrap_or((Handle::NULL, Handle::NULL));
                merge(removed, drop_entities(doc, &ents));
                for h in [be, ee] { if h.value() != 0 { doc.remove_entity_arc(h); } }
                doc.block_records.remove(&name); names[0].push(name);
            }
        }
        let m = RefMap::build(doc);
        let free: Vec<String> = doc.layers.iter().filter(|l| !protected("layer", &l.name) && !m.used("layer", &l.name, l.handle, None)).map(|l| l.name.clone()).collect();
        for n in free { doc.layers.remove(&n); names[1].push(n); }
        let m = RefMap::build(doc);
        let free: Vec<String> = doc.line_types.iter().filter(|l| !protected("linetype", &l.name) && !m.used("linetype", &l.name, l.handle, None)).map(|l| l.name.clone()).collect();
        for n in free { doc.line_types.remove(&n); names[2].push(n); }
        let m = RefMap::build(doc);
        let free: Vec<String> = doc.text_styles.iter().filter(|s| !protected("style", &s.name) && !m.used("style", &s.name, s.handle, None)).map(|s| s.name.clone()).collect();
        for n in free { doc.text_styles.remove(&n); names[3].push(n); }
    }
    let after = counts(doc);
    let lib_note = if library && unreadable == 0 { Some("Blocks kept: nothing is drawn outside block definitions here (a block library), so its blocks are the drawing.".to_string()) } else { None };
    let note = if unreadable > 0 { Some(format!("Skipped: this file has {unreadable} record(s) this tool can't read, and they might use a layer, block, line type or style. Nothing was purged.")) } else { None };
    [("purge_blocks", "Unused blocks"), ("purge_layers", "Unused layers"), ("purge_linetypes", "Unused line types"), ("purge_styles", "Unused text styles")].iter().enumerate()
        .map(|(i, (id, label))| { let mut n = names[i].clone(); n.sort(); json!({ "id": id, "group": "purge", "label": label, "before": before[i], "after": after[i], "items": n.into_iter().take(200).collect::<Vec<_>>(), "note": if i == 0 && note.is_none() { lib_note.clone() } else { note.clone() } }) }).collect()
}

fn style_key(e: &EntityType) -> String {
    let c = e.common();
    format!("{}|{}|{:?}|{}|{:?}|{}|{:?}", c.owner_handle.value(), c.layer.to_lowercase(), c.color, c.linetype.to_lowercase(), c.line_weight, c.linetype_scale, c.transparency)
}
/// Lines tied to other data (reactors, extension dictionaries, app data) are left alone: a dimension or a program may need them.
fn free_entity(e: &EntityType) -> bool { let c = e.common(); c.reactors.is_empty() && c.xdictionary_handle.map(|h| h.value() == 0).unwrap_or(true) && c.extended_data.is_empty() && !c.invisible }

/// Zero-length and degenerate geometry: lines with both ends on one point, circles and arcs with no radius,
/// polylines whose points are all the same.
pub fn zero_length(doc: &mut CadDocument) -> (Value, BTreeMap<String, usize>) {
    let eps = 1e-9; let before = doc.entities().count();
    let drop: Vec<Handle> = doc.entities().filter(|e| free_entity(e) && match e {
        EntityType::Line(l) => l.start.distance(&l.end) <= eps,
        EntityType::Circle(c) => c.radius.abs() <= eps,
        EntityType::Arc(a) => a.radius.abs() <= eps,
        // A wide polyline with one point still draws a dot, so only zero-width ones count.
        EntityType::LwPolyline(p) => !p.vertices.is_empty() && p.constant_width == 0.0 && p.vertices.iter().all(|v| v.start_width == 0.0 && v.end_width == 0.0) && p.vertices.iter().all(|v| (v.location.x - p.vertices[0].location.x).abs() <= eps && (v.location.y - p.vertices[0].location.y).abs() <= eps),
        _ => false,
    }).map(|e| e.common().handle).collect();
    let r = drop_entities(doc, &drop);
    (json!({ "id": "zero", "group": "geometry", "label": "Zero-length objects", "before": before, "after": doc.entities().count(), "by_type": r }), r)
}

/// Text and MText with nothing but spaces in them.
pub fn empty_text(doc: &mut CadDocument) -> (Value, BTreeMap<String, usize>) {
    let is_t = |e: &EntityType| matches!(e, EntityType::Text(_) | EntityType::MText(_));
    let before = doc.entities().filter(|e| is_t(e)).count();
    let drop: Vec<Handle> = doc.entities().filter(|e| free_entity(e) && match e { EntityType::Text(t) => t.value.trim().is_empty(), EntityType::MText(t) => t.value.trim().is_empty(), _ => false }).map(|e| e.common().handle).collect();
    let r = drop_entities(doc, &drop);
    (json!({ "id": "empty_text", "group": "geometry", "label": "Empty text", "before": before, "after": doc.entities().filter(|e| is_t(e)).count(), "by_type": r }), r)
}

/// OVERKILL: exact duplicate circles, arcs and points, and lines that lie on top of each other. Collinear lines that
/// overlap (or one inside another) on the same layer, color, line type and owner are merged into one line from the
/// first point to the last. Lines that only touch end to end are left as they are.
pub fn overkill(doc: &mut CadDocument) -> (Value, BTreeMap<String, usize>) {
    let is_k = |e: &EntityType| matches!(e, EntityType::Line(_) | EntityType::Circle(_) | EntityType::Arc(_) | EntityType::Point(_));
    let before = doc.entities().filter(|e| is_k(e)).count();
    let r = |v: f64| format!("{:.9}", v); let mut seen = HashSet::new(); let mut drop = vec![];
    // Lines grouped by the infinite line they lie on.
    let mut lines: HashMap<String, Vec<(f64, f64, Vector3, Vector3, Handle)>> = HashMap::new();
    for e in doc.entities() {
        if !free_entity(e) { continue; }
        let base = style_key(e);
        match e {
            EntityType::Line(l) => {
                let d = l.end - l.start; let len = d.length(); if !(len > 1e-9) || !len.is_finite() { continue; }
                let mut u = d * (1.0 / len);
                if u.x < -1e-12 || (u.x.abs() <= 1e-12 && (u.y < -1e-12 || (u.y.abs() <= 1e-12 && u.z < 0.0))) { u = u * -1.0; }
                let p0 = l.start - u * l.start.dot(&u); let scale = l.start.length().max(l.end.length()).max(1.0);
                let q = |v: f64| format!("{:.6}", v); let qs = |v: f64| format!("{:.6}", v / scale * 1e3);
                let key = format!("{base}|{}|{} {} {}|{} {} {}|{}", r(l.thickness), q(u.x), q(u.y), q(u.z), qs(p0.x), qs(p0.y), qs(p0.z), format!("{:?}", l.normal));
                let (ta, tb) = (l.start.dot(&u), l.end.dot(&u));
                let (t0, t1, a, b) = if ta <= tb { (ta, tb, l.start, l.end) } else { (tb, ta, l.end, l.start) };
                lines.entry(key).or_default().push((t0, t1, a, b, l.common.handle));
            }
            EntityType::Circle(k) => { if !seen.insert(format!("C|{base}|{} {} {} {}|{:?}", r(k.center.x), r(k.center.y), r(k.center.z), r(k.radius), k.normal)) { drop.push(k.common.handle); } }
            EntityType::Arc(k) => { if !seen.insert(format!("A|{base}|{} {} {} {}|{} {}|{:?}", r(k.center.x), r(k.center.y), r(k.center.z), r(k.radius), r(k.start_angle), r(k.end_angle), k.normal)) { drop.push(k.common.handle); } }
            EntityType::Point(p) => { if !seen.insert(format!("P|{base}|{} {} {}", r(p.location.x), r(p.location.y), r(p.location.z))) { drop.push(p.common.handle); } }
            _ => {}
        }
    }
    let mut merged = 0usize; let mut reshape: Vec<(Handle, Vector3, Vector3)> = vec![];
    for (_k, mut v) in lines {
        if v.len() < 2 { continue; }
        v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.4.cmp(&b.4)));
        let mut i = 0;
        while i < v.len() {
            let (mut end, mut end_pt) = (v[i].1, v[i].3); let mut j = i + 1; let tol = 1e-9 * (1.0 + v[i].1.abs());
            // strictly overlapping (or the same): the next one starts before this run ends
            while j < v.len() && (v[j].0 < end - tol || (v[j].0 - v[i].0).abs() <= tol && (v[j].1 - v[i].1).abs() <= tol) { if v[j].1 > end { end = v[j].1; end_pt = v[j].3; } j += 1; }
            if j - i > 1 {
                let keep = v[i].4; for x in &v[i + 1..j] { drop.push(x.4); }
                if (end - v[i].1).abs() > tol { reshape.push((keep, v[i].2, end_pt)); merged += 1; }
            }
            i = j;
        }
    }
    for (h, a, b) in reshape { if let Some(EntityType::Line(l)) = doc.get_entity_mut(h) { l.start = a; l.end = b; } }
    let rm = drop_entities(doc, &drop);
    (json!({ "id": "overkill", "group": "geometry", "label": "Duplicate and overlapping lines, circles, arcs and points", "before": before, "after": doc.entities().filter(|e| is_k(e)).count(), "by_type": rm, "merged": merged }), rm)
}

/// AUDIT: the CAD library's structure check (handles, owners, references, bad geometry values), plus objects on
/// layers that are missing from the layer table. With fixing on, the safe repairs are applied and missing layers made.
pub fn audit(doc: &mut CadDocument, fix: bool) -> Value {
    let rep = doc.audit();
    let missing: Vec<String> = { let mut s: Vec<String> = doc.entities().map(|e| e.common().layer.clone()).filter(|n| !n.is_empty() && !doc.layers.contains(n)).collect::<HashSet<_>>().into_iter().collect(); s.sort(); s };
    let std_lt = |n: &str| ["bylayer", "byblock", "continuous", ""].contains(&n.to_lowercase().as_str());
    let missing_lt: Vec<String> = { let mut s: Vec<String> = doc.entities().map(|e| e.common().linetype.clone()).chain(doc.layers.iter().map(|l| l.line_type.clone())).filter(|n| !std_lt(n) && !doc.line_types.contains(n)).collect::<HashSet<_>>().into_iter().collect(); s.sort(); s };
    let missing_st: Vec<String> = { let mut s: Vec<String> = doc.entities().filter_map(|e| match e { EntityType::Text(t) => Some(t.style.clone()), EntityType::MText(t) => Some(t.style.clone()), _ => None }).filter(|n| !n.is_empty() && !doc.text_styles.contains(n)).collect::<HashSet<_>>().into_iter().collect(); s.sort(); s };
    let missing_blocks: usize = doc.entities().filter(|e| matches!(e, EntityType::Insert(i) if !doc.block_records.contains(&i.block_name))).count();
    let mut by_code: BTreeMap<String, usize> = BTreeMap::new();
    for i in &rep.issues { *by_code.entry(format!("{:?}", i.code)).or_default() += 1; }
    let samples: Vec<String> = rep.issues.iter().take(20).map(|i| format!("{:?}: {}", i.severity, i.message)).collect();
    let before = rep.issues.len() + missing.len() + missing_lt.len() + missing_st.len() + missing_blocks;
    let (mut after, mut actions, mut unresolved) = (before, vec![], Value::Null);
    if fix {
        let rr = doc.repair();
        for n in &missing { let _ = doc.layers.add(Layer::new(n)); }
        actions = rr.actions.iter().map(|a| format!("{a:?}")).collect::<Vec<_>>();
        if !missing.is_empty() { actions.push(format!("Made {} missing layer(s): {}", missing.len(), missing.iter().take(20).cloned().collect::<Vec<_>>().join(", "))); }
        for n in &missing_lt { let _ = doc.line_types.add(LineType::new(n)); }
        if !missing_lt.is_empty() { actions.push(format!("Made {} missing line type(s) (drawn as solid until you load the real one): {}", missing_lt.len(), missing_lt.iter().take(20).cloned().collect::<Vec<_>>().join(", "))); }
        for n in &missing_st { let _ = doc.text_styles.add(TextStyle::new(n)); }
        if !missing_st.is_empty() { actions.push(format!("Made {} missing text style(s) with the default font: {}", missing_st.len(), missing_st.iter().take(20).cloned().collect::<Vec<_>>().join(", "))); }
        after = rr.after.issues.len() + missing_blocks; unresolved = json!(rr.unresolved.iter().take(20).map(|i| i.message.clone()).collect::<Vec<_>>());
    }
    json!({ "id": "audit", "group": "audit", "label": "Audit (structure problems)", "before": before, "after": after, "fixed": fix,
        "scanned": rep.scanned_records, "by_code": by_code, "samples": samples, "missing_layers": missing, "missing_linetypes": missing_lt, "missing_styles": missing_st, "inserts_of_missing_blocks": missing_blocks,
        "errors": rep.error_count(), "warnings": rep.warning_count(), "actions": actions, "unresolved": unresolved })
}

/// Run the chosen operations in a fixed order: audit first (on what was read), then geometry, then purge (so geometry
/// removed above can free a layer or block).
pub fn run_cleaning(doc: &mut CadDocument, o: &CleanOpts) -> CleanRun {
    let mut run = CleanRun::default();
    run.audit = audit(doc, o.audit);
    if o.audit { run.ops.push(run.audit.clone()); }
    if o.zero { let (v, r) = zero_length(doc); merge(&mut run.removed, r); run.ops.push(v); }
    if o.empty_text { let (v, r) = empty_text(doc); merge(&mut run.removed, r); run.ops.push(v); }
    if o.overkill { let (v, r) = overkill(doc); merge(&mut run.removed, r); run.ops.push(v); }
    if o.purge { let mut r = BTreeMap::new(); let v = purge_unused(doc, &mut r); merge(&mut run.removed, r); run.ops.extend(v); }
    run
}
