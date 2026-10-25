# Open Permit Hub e2e regression suite

```
cd /home/claude/stress/e2e
node run.mjs                                  # all tests, live site
BASE=http://localhost:4173/ node run.mjs      # local `vite preview` of app/dist
node run.mjs qa-0 cor                         # only ids containing these words
node run.mjs --repeat=3 --workers=2 --out=x.json   # flake check
```

Output: PASS/FAIL table on stdout, `results.json` (or `--out`), and `out/<test-id>/` with downloads and `fail-*.png` screenshots. Exit code 0 only when every test passes.

Files: `run.mjs` runner, `tests.mjs` test catalog (ids map to round-1 findings), `lib.mjs` helpers (fill a project, downloads, site mirror + fake deploy), `validate.py` (DXF via ezdxf, ZIP, CSV), `fixtures/` CAD files, `oldbuild/` the round-1 build (serve with `python3 -m http.server 4180` and set BASE to prove tests fail on old behavior).
Needs: playwright (global), pdfinfo/pdftotext, python3 + ezdxf, `npm i` here for axe-core.
