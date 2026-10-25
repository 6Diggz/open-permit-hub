# Privacy notes (facts, not a privacy policy)

These are engineering facts for the attorney who will write the privacy notice (`TERMS_PENDING_ATTORNEY_REVIEW.md`). They are not legal advice and not a legal notice.

- **No server of ours.** The app is static files on GitHub Pages. It has no accounts, no analytics, no telemetry and no error upload.
- **Project data stays in the browser** (`localStorage` keys `opa.index` and `opa.p.<id>`). It leaves the device only when the user saves or shares a file.
- **Network requests**: only to the site's own origin (checked in CI by `app/e2e/e2e.mjs`, test "appsec-12"). A Content-Security-Policy limits connections to the same origin.
- **Error reports** are built on the device and copied by the user; they hold app version, rule pack, error text and stack, no project data (`app/src/core/errorreport.ts`).
- **GitHub** hosts the site and sees visitor IP addresses under its own terms.
- **CCPA/CPRA**: the published thresholds (for example, annual revenue above about $26.6M, or buying/selling/sharing personal information of 100,000+ consumers) are far from this project today, and the app collects no personal information on a server. Whether the law applies is a legal question: **attorney to confirm**. Re-check before adding accounts, analytics, payments or any server.
