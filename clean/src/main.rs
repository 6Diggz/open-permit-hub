fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 2 { eprintln!("usage: cleanfix <in.dwg|dxf> [out] [r12|r14|r2000|r2018|dwg] [units]"); std::process::exit(2); }
    let bytes = std::fs::read(&a[1]).expect("read input");
    let doc = match cleanfix::read(&bytes) { Ok(d) => d, Err(e) => { eprintln!("{e}"); std::process::exit(1) } };
    println!("{}", serde_json::to_string_pretty(&cleanfix::inspect_doc(&doc, bytes.len())).unwrap());
    if a.len() >= 3 {
        let out = cleanfix::clean_doc(doc, a.get(3).map(|s| s.as_str()).unwrap_or("r2018"), a.get(4).and_then(|s| s.parse().ok()).unwrap_or(-1)).expect("clean");
        std::fs::write(&a[2], out).expect("write"); eprintln!("wrote {}", a[2]);
    }
}
