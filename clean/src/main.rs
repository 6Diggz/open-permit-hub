//! cleanfix CLI.
//!   cleanfix <in.dwg|dxf> [out] [r12|r14|r2000|r2018|dwg] [units]      inspect, and write one clean copy
//!   cleanfix --batch <in-folder> <out-folder> [target] [opts-json]     clean every DWG/DXF in a folder (OUT2-13)
//!   cleanfix --fidelity <folder> [target...]                           read -> write -> read every file, JSON lines (OUT-19)
use std::path::Path;

fn cad_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut v: Vec<_> = rd.flatten().map(|e| e.path()).collect(); v.sort();
    for p in v {
        if p.is_dir() { cad_files(&p, out); continue; }
        let e = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        if e == "dwg" || e == "dxf" { out.push(p); }
    }
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 2 { eprintln!("usage: cleanfix <in.dwg|dxf> [out] [r12|r14|r2000|r2018|dwg] [units]\n       cleanfix --batch <in-folder> <out-folder> [target] [opts-json]\n       cleanfix --fidelity <folder> [target...]"); std::process::exit(2); }
    if a[1] == "--batch" {
        if a.len() < 4 { eprintln!("usage: cleanfix --batch <in-folder> <out-folder> [target] [opts-json]"); std::process::exit(2); }
        let target = a.get(4).map(|s| s.as_str()).unwrap_or("r2018"); let opts = cleanfix::CleanOpts::from_json(a.get(5).map(|s| s.as_str()).unwrap_or("{}"));
        let mut files = vec![]; cad_files(Path::new(&a[2]), &mut files); std::fs::create_dir_all(&a[3]).expect("make out folder");
        let mut report = vec![]; let mut failed = 0;
        for f in &files {
            let bytes = std::fs::read(f).expect("read input");
            let r = cleanfix::batch_one(&bytes, target, -1, &opts);
            if let Some(out) = r.1 {
                let name = format!("{}-clean-{}.{}", f.file_stem().unwrap().to_string_lossy(), target, if target == "dwg" { "dwg" } else { "dxf" });
                std::fs::write(Path::new(&a[3]).join(name), out).expect("write");
            } else { failed += 1; }
            let mut v = r.0; v["file"] = serde_json::json!(f.to_string_lossy()); report.push(v);
        }
        std::fs::write(Path::new(&a[3]).join("report.json"), serde_json::to_string_pretty(&report).unwrap()).expect("write report");
        eprintln!("{} file(s), {} could not be cleaned. Report: {}/report.json", files.len(), failed, a[3]);
        std::process::exit(if failed > 0 { 1 } else { 0 });
    }
    if a[1] == "--fidelity" {
        let targets: Vec<&str> = if a.len() > 3 { a[3..].iter().map(|s| s.as_str()).collect() } else { vec!["r2018", "dwg"] };
        let mut files = vec![]; cad_files(Path::new(a.get(2).map(|s| s.as_str()).unwrap_or(".")), &mut files);
        for f in &files {
            let bytes = std::fs::read(f).expect("read input");
            for t in &targets { let mut v = cleanfix::fidelity(&bytes, t); v["file"] = serde_json::json!(f.to_string_lossy()); println!("{v}"); }
        }
        return;
    }
    let bytes = std::fs::read(&a[1]).expect("read input");
    match cleanfix::inspect_bytes(&bytes) { Ok(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap()), Err(e) => { eprintln!("{e}"); std::process::exit(1) } }
    if a.len() >= 3 {
        let target = a.get(3).map(|s| s.as_str()).unwrap_or("r2018"); let units = a.get(4).and_then(|s| s.parse().ok()).unwrap_or(-1);
        eprintln!("{}", serde_json::to_string_pretty(&cleanfix::loss_report(&bytes, target, units)).unwrap());
        let doc = cleanfix::read(&bytes).unwrap_or_else(|e| { eprintln!("{e}"); std::process::exit(1) });
        match cleanfix::clean_doc(doc, target, units) { Ok(out) => { std::fs::write(&a[2], out).expect("write"); eprintln!("wrote {}", a[2]); } Err(e) => { eprintln!("{e}"); std::process::exit(1) } }
    }
}
