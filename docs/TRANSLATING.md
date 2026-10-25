# Translating the app

The app's screens can be shown in any language. Adding a language means adding **one file**. No code changes.

## How it works

- English is the source text. Every screen string is written in English inside `L("...")` in the code.
- Spanish lives in `app/src/ui/es.ts` (built in and reviewed).
- Every other language is one JSON file: `app/src/ui/locales/<code>.json`.
  The app finds the file by itself, adds the language to the menu (in its own name, for example 한국어), and loads it only when someone picks it.
- A string that is missing falls back to English, so a half-done file never breaks the app. The tests still require every key before a file can be merged.

## Languages today

| Code | Language | Status |
|---|---|---|
| es | Spanish | Reviewed |
| ko | Korean | Beta: machine-made, not yet reviewed |
| zh-Hans | Chinese (Simplified) | Beta: machine-made, not yet reviewed |
| zh-Hant | Chinese (Traditional) | Beta: made from Simplified with OpenCC (s2twp), not yet reviewed |
| hy | Armenian | Beta: machine-made, not yet reviewed |
| tl | Tagalog | Beta: machine-made, not yet reviewed |
| fa | Farsi | Beta: machine-made, not yet reviewed, right-to-left |

These are the LA City Tier 1 languages named in the Citywide Language Access Plan, plus Spanish.

## Add a language

1. Copy `app/src/ui/locales/ko.json` to `app/src/ui/locales/<code>.json`. Use a BCP-47 code, for example `vi`, `ru`, `ja`, `zh-Hant`.
2. Set `_meta`:
   - `"beta": true` until a native speaker has reviewed every string.
   - `"dir": "rtl"` for right-to-left scripts (Arabic, Farsi, Hebrew, Urdu), else `"ltr"`.
   - `"reviewedBy": ""` stays empty until the review is done.
3. Replace every value (right side) with your translation. Never change a key (left side).
4. Run the check: `cd app && npx vitest run src/test/r9/i18n.test.ts`. It lists missing, empty or extra keys.
5. Open a pull request. Say in it whether you are a native speaker and whether you know building terms.

## Rules for translators

- **Keep in English, on purpose:** code citations (LABC, LARC, Gov. Code sections), form numbers (PC/STR/Corr.Lst.20A), sheet item ids (III.F.2), program and place names that are legal names (City of Los Angeles, LA City, LADBS, ZIMAS, HPOZ, AB 2533, Title 24, CF1R, HERS, DWP, APN), and file types (PDF, DXF, ZIP, CSV). You may add a short explanation in brackets after a name, for example `Coastal Zone (해안 구역)`.
- Rule results, code citations and the plan sheets themselves stay in English (or Spanish) because the city reviews them in English. The app says this in the beta banner.
- Keep units as written (ft, in, sq ft). Do not convert to meters.
- Keep input examples exactly as written, like `20' 6"`. In right-to-left text, wrap them in Unicode isolate marks (U+2066 ... U+2069) so they read correctly.
- Some keys are pieces of a sentence (for example `"of"`, `"items found."`). Translate them so the joined sentence reads naturally; check the screen.
- Plain words, short sentences, about an 8th-grade level. The readers are homeowners on a phone.

## Safety-critical strings

Strings about fire, escape windows, alarms, sprinklers, burn areas, hazards and engineering are listed in `docs/TRANSLATION_REVIEW.md` (regenerate it with `node scripts/translation-review.mjs` after changing a locale). Each is **NEEDS_PEOPLE** until a native speaker confirms it. A wrong word there can change a life-safety answer. A language keeps its beta label until every row for it is confirmed.

## Remove the beta label

When every string (and every row in `TRANSLATION_REVIEW.md`) for a language has been reviewed by a native speaker: set `"beta": false` and fill `"reviewedBy"` with the reviewer's name in the same pull request.

## PDFs

Names and addresses typed in any of these scripts print in the PDFs. The app embeds Noto Sans (SIL Open Font License) for Korean, Chinese, Armenian and Arabic script, and loads only the font pieces the text needs, only when a PDF is made. Arabic-script text is shaped by the font engine; words of an Arabic-script run are put right to left. Persian and Arabic-Indic digits (۱۲۳) are not printed yet: the app lists them as characters it cannot print, so type Latin digits (123) in addresses. Mixed right-to-left and left-to-right text on one PDF line can still print in an odd order (beta).
