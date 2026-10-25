import type { Project } from '../core/model';
/** Calendar deadlines with stable UID + SEQUENCE so updates replace old events (fix F29). */
export function deadlinesICS(p: Project, filedOn: string, seq = 0): string {
  const d = new Date(filedOn + 'T09:00:00');
  const add = (m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
  const fmt = (x: Date) => x.toISOString().slice(0, 10).replace(/-/g, '');
  const ev = (key: string, when: Date, title: string, note: string) => [
    'BEGIN:VEVENT', `UID:${p.id}-${key}@open-permit-hub`, `SEQUENCE:${seq}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${fmt(when)}`, `SUMMARY:${title}`, `DESCRIPTION:${note}`,
    'BEGIN:VALARM', 'TRIGGER:-P30D', 'ACTION:DISPLAY', `DESCRIPTION:${title} in 30 days`, 'END:VALARM', 'END:VEVENT'];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Permit Hub//EN', 'CALSCALE:GREGORIAN',
    ...ev('plancheck', add(18), 'Plan check expires (LAMC 98.0603)', 'Get the permit issued or request an extension before this date.'),
    'END:VCALENDAR'].join('\r\n');
}
export function permitICS(p: Project, issuedOn: string, seq = 0) {
  return deadlinesICS({ ...p }, issuedOn, seq).replace('plancheck', 'permitstart').replace('Plan check expires (LAMC 98.0603)', 'Start work or permit expires (LAMC 98.0602)').replace(/DTSTART;VALUE=DATE:(\d{8})/, (_m) => { const x = new Date(issuedOn + 'T09:00:00'); x.setMonth(x.getMonth() + 12); return 'DTSTART;VALUE=DATE:' + x.toISOString().slice(0, 10).replace(/-/g, ''); });
}
