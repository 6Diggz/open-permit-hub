#!/usr/bin/env python3
"""File validators for the e2e suite. Usage: validate.py dxf|zip|csv <file>. Prints one JSON object."""
import csv, io, json, re, sys, zipfile


def dxf(path):
    import ezdxf
    from ezdxf import recover
    out = {"ok": True}
    try:
        doc = ezdxf.readfile(path)
    except Exception as e:  # strict read failed, try recover to report more
        out["strict_error"] = str(e)[:200]
        doc, aud = recover.readfile(path)
        out["recover_errors"] = len(aud.errors)
        out["ok"] = False
    msp = doc.modelspace()
    out["version"] = doc.dxfversion
    out["insunits"] = doc.header.get("$INSUNITS", None)
    out["layers"] = sorted(l.dxf.name for l in doc.layers)
    used = {}
    types = {}
    for e in msp:
        used[e.dxf.layer] = used.get(e.dxf.layer, 0) + 1
        types[e.dxftype()] = types.get(e.dxftype(), 0) + 1
    out["entities_by_layer"] = used
    out["types"] = types
    return out


def zipcheck(path):
    z = zipfile.ZipFile(path)
    bad = z.testzip()
    names = z.namelist()
    readme = next((n for n in names if re.match(r"(?i)readme", n.split("/")[-1])), None)
    listed = []
    if readme:
        txt = z.read(readme).decode("utf-8", "replace")
        m = re.search(r"Contents:(.*)", txt)
        if m:
            listed = re.findall(r"[\w.-]+\.(?:pdf|dxf|html|csv|permitpack|txt|ics|json)", m.group(1))
    missing = [n for n in listed if n not in names]
    return {"names": names, "crc_bad": bad, "readme": readme, "listed": listed, "missing": missing}


def csvcheck(path):
    raw = open(path, "rb").read().decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(raw)))
    widths = sorted({len(r) for r in rows if r})
    return {"rows": len(rows), "widths": widths, "has_inch_mark": any('16"' in c for r in rows for c in r)}


if __name__ == "__main__":
    kind, path = sys.argv[1], sys.argv[2]
    try:
        print(json.dumps({"dxf": dxf, "zip": zipcheck, "csv": csvcheck}[kind](path)))
    except Exception as e:
        print(json.dumps({"error": str(e)[:300]}))
