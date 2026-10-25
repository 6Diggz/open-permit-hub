import type { Project } from '../core/model';

/** Add calendar months; a day that does not exist in the target month becomes that month's last day (2026-08-31 + 18 months = 2028-02-29, a leap year; 2027-08-31 + 18 = 2029-02-28). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = (m - 1) + months, ty = y + Math.floor(t / 12), tm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
/** RFC 5545 TEXT escaping; CR/LF never reach the file as raw line breaks (no property injection). */
export const icsText = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
const uidPart = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || 'project';
/** A real calendar date in YYYY-MM-DD (2026-02-30 and 2026-13-01 are refused). */
const isDate = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
/** RFC 5545 3.1: fold content lines longer than 75 octets (CRLF + one space), never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out: string[] = []; let cur = '', n = 0, lim = 75;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > lim) { out.push(cur); cur = ''; n = 0; lim = 74; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n ');
}

/** Calendar deadlines with stable UID + SEQUENCE so updates replace old events (fix F29). */
export function deadlinesICS(p: Project, filedOn: string, seq = 0, issuedOn?: string): string {
  if (!isDate(filedOn)) throw new Error('Enter the filing date as a real date.');
  const fmt = (iso: string) => iso.replace(/-/g, '');
  const ev = (key: string, when: string, title: string, note: string) => [
    'BEGIN:VEVENT', `UID:${uidPart(p.id)}-${key}@open-permit-hub`, `SEQUENCE:${Math.max(0, Math.floor(seq))}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${fmt(when)}`, `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(note)}`,
    'BEGIN:VALARM', 'TRIGGER:-P30D', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title + ' in 30 days')}`, 'END:VALARM', 'END:VEVENT'];
  const events = [...ev('plancheck', addMonths(filedOn, 18), 'Plan check expires (LAMC 98.0603)', 'Get the permit issued or request an extension on or before this date.')];
  if (issuedOn && !isDate(issuedOn)) throw new Error('Enter the permit issue date as a real date.');
  if (issuedOn) events.push(
    ...ev('permitstart', addMonths(issuedOn, 12), 'Start work or the permit expires (LAMC 98.0602)', 'Work must start within 12 months of issue and must not stop for 12 months.'),
    ...ev('permitlife', addMonths(issuedOn, 24), 'Permit 2-year limit (LAMC 98.0602)', 'The permit is valid for 2 years unless extended. Ask LADBS about an extension before this date.'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Permit Hub//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n';
}
