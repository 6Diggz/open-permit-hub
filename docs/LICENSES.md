# Third-party licenses
| Component | License | How we use it |
|---|---|---|
| acadrust 0.6.7 | MPL-2.0 (single license, checked in its LICENSE file) | Unmodified dependency of `clean/`. If we ever change its files, those files stay MPL-2.0 and their source is published. |
| pdf-lib | MIT | PDF export |
| three.js | MIT | Scan (GLTF) import |
| fflate | MIT | ZIP export |
| React, Vite | MIT | App |
| @modelcontextprotocol/sdk | MIT | Claude connection |
| Public Sans font | OFL-1.1 | UI typeface |
Rules: no GPL code in the bundle (CI check planned). Hatch patterns: none shipped yet; only our own CC0 patterns may be added.
