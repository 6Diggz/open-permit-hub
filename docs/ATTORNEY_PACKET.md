# Attorney review packet (prep only; does not block the build)
Send this with the repo link when ready. Budget estimate: $2-5k for a California attorney.

## Questions
1. **Unlicensed practice (B&P 5536, 5537, 6737.1):** The app helps owners and drafters prepare plans for single-family conventional wood-frame ADUs, and flags non-conventional parts for an engineer. Is the app or its maker "preparing plans for others"? Is the wording safe?
2. **Consumer claims (FTC Act, CA UCL/FAL):** We say "check", "pre-check", "ready for your preparer", never "approved" or "permit-ready". Review all UI and PDF copy. The plan-set PDF pre-check never says an item is provided: it says "Found on page N. Confirm it is shown as provided.", "Says not provided", "Conflicts with code" or "Not found in the text" (r8-01).
3. **Reviewer directory (later layer):** Flat listing fee, user contracts the licensee, licenses verified. RI DBR 25DP001 precedent: what wording and structure keep us out of practicing engineering/architecture?
4. **Terms of service language (Civ. Code 1632):** English binding with a Spanish courtesy copy. Is that enough for a free tool? For paid tiers?
5. **Code text copyright (ICC v. UpCodes):** We cite section numbers and summarize in our own words. OK?
6. **Liability:** Disclaimers, warranty limits, and whether E&O insurance is needed before any paid tier.
7. **Entity:** LLC state (AZ vs CA), CA franchise tax ($800/yr from year one).
8. **Privacy:** Local-first, no server. Is CCPA out of scope today? What triggers it?
9. **Open-source license choice:** Apache-2.0 for our code with MPL-2.0 dependency.
## Where the risky copy lives
- `app/src/rules/la-city.ts` (rule messages), `app/src/out/pdf.ts` (sheet note, report header), `app/src/ui/App.tsx` (UI copy).
