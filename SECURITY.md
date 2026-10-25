# Security

## Report a problem
Use GitHub's private **Report a vulnerability** button (Security tab of this repo). Please don't open a public issue.
Rule errors that could cause a wrong "pass" on a safety item are treated as security issues.

## Supported versions
| Part | Supported |
|---|---|
| Live site (https://6diggz.github.io/open-permit-hub/) | Always the latest `main` build |
| `main` branch (app, `clean/`, `mcp/`) | Yes |
| Older tags | No. Update to the latest release. |
| Rule pack | The pack named in `app/src/rules/pack.ts` (`PACK.version`). The app warns when it is past `PACK.reviewBy`. |

## In scope
- The web app: anything that leaks project data off the device, runs script from a file, or breaks the export gate.
- Permit packs (`.permitpack`): parsing of untrusted files, the passphrase lock (PBKDF2-SHA256 600k + AES-GCM, header authenticated from v2).
- The MCP server (`mcp/`): reading or writing outside `OPA_ROOT` (including through symlinks), output that mixes file text into instructions.
- Clean and Fix (`clean/`): crashes, hangs or memory blowups on crafted DWG/DXF files.
- The build and deploy pipeline (`.github/workflows`).

## Out of scope
- GitHub Pages hosting itself (report to GitHub).
- Your own browser extensions or a device that is already compromised.

## How we handle reports
We confirm, fix on `main`, add a regression test, and credit you in `CHANGELOG.md` if you want.
Response-time commitments and safe-harbor wording: **pending attorney review** (see `docs/TERMS_PENDING_ATTORNEY_REVIEW.md`). Nothing here is a legal promise yet.
