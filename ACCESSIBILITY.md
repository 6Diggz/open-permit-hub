# Accessibility

**Goal:** WCAG 2.1 AA. **Status:** not yet audited by an outside reviewer. This page says what is tested today and what is known to be missing.

## Tested on every push (CI, `app/e2e/e2e.mjs`)
- axe-core rules `nested-interactive`, `page-has-heading-one`, `landmark-one-main`, `scrollable-region-focusable`, `color-contrast`, `button-name`, `label`, `aria-allowed-role` on the welcome screen and all five steps, at 390 px and 1440 px wide, light and dark mode, English and Spanish.
- Keyboard: focus moves to the new step's heading; the ADU on the site plan moves with arrow keys; the browser Back button moves between steps.
- Every action is reachable at phone width (including "All projects").

## Known gaps
- PDF exports are not tagged. Each check report also comes as an HTML file built for screen readers (in the handoff ZIP and on the Export step).
- The full axe rule set and manual screen-reader passes (VoiceOver, NVDA, TalkBack) are not yet part of CI.
- Clean and Fix is English only.

## Report a barrier
Open an issue with the "Accessibility" label. Please say which screen, device, browser and assistive technology.
