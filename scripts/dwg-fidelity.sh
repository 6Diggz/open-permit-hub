#!/bin/bash
# OUT-19: measure DWG/DXF fidelity on public sample corpora (LibreDWG test-data, ezdxf examples). The corpus files are not
# copied into this repo (LibreDWG's are GPL); this script fetches them into a temp folder and prints the pass rates.
# Usage: scripts/dwg-fidelity.sh [workdir]     (needs git, cargo, python3)
set -euo pipefail
W=${1:-$(mktemp -d)}; cd "$W"
[ -d libredwg ] || { git clone -q --depth 1 --filter=blob:none --sparse https://github.com/LibreDWG/libredwg.git && git -C libredwg sparse-checkout set test/test-data; }
[ -d ezdxf ] || { git clone -q --depth 1 --filter=blob:none --sparse https://github.com/mozman/ezdxf.git && git -C ezdxf sparse-checkout set examples_dxf integration_tests/data; }
HERE=$(cd "$(dirname "$0")/.." && pwd); (cd "$HERE/clean" && cargo build --release -q); BIN="$HERE/clean/target/release/cleanfix"
: > fid.jsonl
find libredwg ezdxf -type f \( -iname '*.dwg' -o -iname '*.dxf' \) | sort | while read -r f; do
  d=$(mktemp -d); cp "$f" "$d/"; r=$(timeout 120 "$BIN" --fidelity "$d" r2018 dwg 2>/dev/null || true)
  if [ -z "$r" ]; then echo "{\"file\":\"$f\",\"crash\":true}" >> fid.jsonl; else echo "$r" | sed "s#$d/#${f%/*}/#" >> fid.jsonl; fi; rm -rf "$d"
done
python3 - fid.jsonl <<'PY'
import json,sys
rows=[json.loads(l) for l in open(sys.argv[1]) if l.strip()]
files=sorted(set(r['file'] for r in rows)); print('files', len(files), 'crashes/timeouts', sum('crash' in r for r in rows))
for t in ['r2018','dwg']:
  rs=[r for r in rows if r.get('target')==t]; base=[r for r in rs if r['read'] and 'no objects' not in str(r.get('write_error',''))]
  print(t, 'read', sum(r['read'] for r in rs), 'of', len(rs), '| with objects', len(base), '| written', sum(r.get('write',False) for r in base), '| pass', sum(r['pass'] for r in base), '| pass incl. hidden data', sum(r['hidden_pass'] for r in base))
PY
echo "raw results: $W/fid.jsonl"
