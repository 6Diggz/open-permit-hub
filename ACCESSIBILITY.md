# Accessibility

**Goal:** WCAG 2.1 AA. **Status:** not yet audited by an outside reviewer. This page says what is tested today and what is known to be missing.

## Tested on every push (CI, `app/e2e/e2e.mjs`)
- axe-core rules `nested-interactive`, `page-has-heading-one`, `landmark-one-main`, `scrollable-region-focusable`, `color-contrast`, `button-name`, `label`, `aria-allowed-role` on the welcome screen and all five steps, at 390 px and 1440 px wide, light and dark mode, English and Spanish.
- Keyboard: focus moves to the new step's heading; the ADU on the site plan moves with arrow keys; the browser Back button moves between steps.
- Every action is reachable at phone width (including "All projects").

## WCAG 2.1 AA checks beyond axe (CI, `app/e2e/a11y.mjs`, added 2026-10-25)
Run on 11 screens (welcome, project list, the six steps, field mode, Clean and Fix, the passphrase dialog, a rule page) at 390 px and 1440 px:
- **Keyboard (2.1.1, 2.1.2):** a scripted Tab pass through each whole screen. Every visible, enabled control is reached (controls inside a closed "details" section are reached after it is opened). No keyboard trap; the open dialog keeps focus inside it, closes with Escape and gives focus back to the button that opened it.
- **Focus order (2.4.3):** no positive `tabindex`; the Tab order follows the page (no large jumps back up within a column).
- **Focus visible (2.4.7):** every Tab stop shows a 3 px focus outline. Fixed in this pass: the "Skip to content" link was focusable but stayed invisible; date fields (and their calendar button) showed no outline; rule-page links relied on the browser default.
- **Reflow (1.4.10):** at 320 px wide there is no sideways scroll and nothing runs off the right edge (the site-plan drawing and tables are the allowed exceptions).
- **Text spacing (1.4.12):** with line height 1.5, letter spacing 0.12 em, word spacing 0.16 em and paragraph spacing 2 em applied, no text is cut off and nothing scrolls sideways at 320 px.
- **Target size:** every button, field and toggle is at least 24 x 24 CSS px (the WCAG 2.2 level AA minimum; 2.1 has no AA target rule). Fixed: "Sources" toggles were shorter than 24 px on phones.
- **Status messages (4.1.3):** banners, toasts and the save state are in `role="status"`, `role="alert"` or a live region. Fixed: the phone-width answer line at the top of each step had no live role.
- **Orientation and zoom (1.3.4, 1.4.4):** no orientation lock; pinch zoom is not blocked.

How it was checked: the script above, which drives Chromium with the keyboard only. It is a scripted keyboard pass, not a person using a screen reader.

## Known gaps
- PDF exports are not tagged. Each check report also comes as an HTML file built for screen readers (in the handoff ZIP and on the Export step).
- The full axe rule set is not yet part of CI.
- No manual screen-reader pass yet (VoiceOver, NVDA, TalkBack): reading order, names and announcements are checked by script only.
- The keyboard pass runs in Chromium only, not Safari or Firefox.
- No conformance claim is made. This page lists what is tested and what was fixed; an outside audit has not been done.
- Clean and Fix is English only.

## Report a barrier
Open an issue with the "Accessibility" label. Please say which screen, device, browser and assistive technology.

## Field mode (inspector, `#field`)
Field mode adds the `.fm-hc` class (round 6). It targets WCAG AAA text contrast (7:1) and 56 x 56 CSS px minimum targets for gloved hands. Secondary text uses the `--ink` token. Light theme only, it uses darker variants of the status tokens: `--pass` #145a38 (8.24:1 with white text), `--fix` #8c1b12 (9.21:1), `--info-need`/`--info-text` #6a4405. These are the only new color values. The rest of the app is unchanged.
