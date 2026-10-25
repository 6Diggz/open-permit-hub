fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 2 { eprintln!("usage: cleanfix <in.dwg|dxf> [out] [r12|r14|r2000|r2018|dwg] [units]"); std::process::exit(2); }
    let bytes = std::fs::read(&a[1]).expect("read input");
    match cleanfix::inspect_bytes(&bytes) { Ok(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap()), Err(e) => { eprintln!("{e}"); std::process::exit(1) } }
    if a.len() >= 3 {
        let target = a.get(3).map(|s| s.as_str()).unwrap_or("r2018"); let units = a.get(4).and_then(|s| s.parse().ok()).unwrap_or(-1);
        eprintln!("{}", serde_json::to_string_pretty(&cleanfix::loss_report(&bytes, target, units)).unwrap());
        let doc = cleanfix::read(&bytes).unwrap_or_else(|e| { eprintln!("{e}"); std::process::exit(1) });
        match cleanfix::clean_doc(doc, target, units) { Ok(out) => { std::fs::write(&a[2], out).expect("write"); eprintln!("wrote {}", a[2]); } Err(e) => { eprintln!("{e}"); std::process::exit(1) } }
    }
}
