# Third-party licenses
| Component | License | How we use it |
|---|---|---|
| acadrust 0.6.7 | MPL-2.0 (single license, checked in its LICENSE file) | Unmodified dependency of `clean/`. If we ever change its files, those files stay MPL-2.0 and their source is published. |
| pdf-lib | MIT | PDF export |
| pdf.js (pdfjs-dist) | Apache-2.0 | Plan-set pre-check: reads the text of a PDF on the device |
| three.js | MIT | Scan (GLTF) import |
| fflate | MIT | ZIP export |
| React, Vite | MIT | App |
| @modelcontextprotocol/sdk | MIT | Claude connection |
| Public Sans font | OFL-1.1 | UI typeface |
Rules: no GPL code in the bundle (checked in CI by license-checker). The full notices ship as `THIRD_PARTY_NOTICES.txt` on the site and in every handoff ZIP (regenerate with `node app/scripts/notices.mjs`). Hatch patterns: none shipped yet; only our own CC0 patterns may be added.
