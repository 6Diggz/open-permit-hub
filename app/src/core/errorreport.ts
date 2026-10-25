import { PACK_ID } from '../rules/pack';
/** Error report with no personal data: versions, the error, and the stack (URLs stripped). Nothing is sent anywhere. */
export function errorReport(err: Error, ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const strip = (s: string) => s.replace(/https?:\/\/[^\s)]+\//g, '').slice(0, 4000);
  return JSON.stringify({ app: 'open-permit-hub', pack: PACK_ID, when: new Date().toISOString().slice(0, 10), ua: ua.replace(/\([^)]*\)/g, '(...)'), error: String(err?.message ?? err).slice(0, 500), stack: strip(String(err?.stack ?? '')) }, null, 1);
}
