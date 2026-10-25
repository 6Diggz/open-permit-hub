// Keyboard: Delete on a focused room must leave focus on the plan (next room or the plan), not drop it to <body>.
import { rooms, done } from './_ui.mjs';
const { b, page, rooms: r } = await rooms(3);
await r.nth(2).focus(); await page.keyboard.press('Delete');
const tag = await page.evaluate(() => document.activeElement?.tagName);
await done(b, tag !== 'BODY', 'focus after Delete is ' + tag);
