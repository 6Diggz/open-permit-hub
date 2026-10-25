// Keyboard only: a shaped (L) room's corners must be movable without a pointer (WCAG 2.1.1).
import { rooms, done } from './_ui.mjs';
const { b, page, rooms: r } = await rooms(2);
await r.nth(1).click(); await page.getByRole('button', { name: /Change the shape/ }).click();
const reshaped = (a, z) => { const P = s => s.split(' ').map(t => t.split(',').map(Number)); const A = P(a), Z = P(z); const dx = Z[0][0] - A[0][0], dy = Z[0][1] - A[0][1]; return A.length !== Z.length || A.some((q, i) => Math.abs(Z[i][0] - q[0] - dx) > 1 || Math.abs(Z[i][1] - q[1] - dy) > 1); };
const before = await r.nth(1).getAttribute('points');
// try every plausible keyboard path: focus corner handles if focusable, else Alt/Ctrl+arrows on the room
const handles = page.locator('.drawing svg [tabindex="0"]:not(polygon)'); let moved = false;
if (await handles.count()) { await handles.first().focus(); await page.keyboard.press('ArrowLeft'); moved = reshaped(before, await r.nth(1).getAttribute('points')); }
if (!moved) { await r.nth(1).focus(); for (const k of ['Alt+ArrowLeft', 'Control+ArrowLeft']) { await page.keyboard.press(k); } moved = reshaped(before, await r.nth(1).getAttribute('points')); }
await done(b, moved, 'keyboard can reshape a shaped room: ' + moved);
