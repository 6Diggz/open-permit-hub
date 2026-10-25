// Site-visit record (PDF, letter size): every checklist item with its result, note and photo. Fonts embedded like every sheet.
import { PDFDocument, rgb, PDFName, PDFString, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Project } from '../core/model';
import { INSP_ITEMS, GROUPS, result, tally, fieldConflicts, appFails } from '../core/inspection';
import { getVerdict } from '../core/verdict';
import { sheetFonts } from './pdffonts';
import { safe } from './glyphs';

const INK = rgb(0.12, 0.14, 0.18), MUTE = rgb(0.42, 0.45, 0.5), RED = rgb(0.72, 0.16, 0.12), GREEN = rgb(0.1, 0.45, 0.25), GREY = rgb(0.39, 0.45, 0.55);
function wrap(t: string, f: PDFFont, size: number, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of t.split(/\s+/)) { const n = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(n, size) > max && line) { out.push(line); line = w; } else line = n; }
  if (line) out.push(line); return out;
}

/** `photos`: JPEG bytes by photo id (missing ids print "photo not on this device"). */
export async function inspectionPDF(p: Project, photos: Record<string, Uint8Array>, lang: 'en' | 'es' = p.people.language): Promise<Uint8Array> {
  const es = lang === 'es'; const ins = p.inspection; const t = tally(ins);
  // r5whole-02: the app's own result is printed next to every field result; a Pass over a failing check is recorded as an override.
  const rep = getVerdict(p).report; const conf = new Set(fieldConflicts(p, rep));
  const doc = await PDFDocument.create(); doc.setTitle(`${p.name} - ${es ? 'registro de visita' : 'site visit record'}`); doc.catalog.set(PDFName.of('Lang'), PDFString.of(es ? 'es-US' : 'en-US'));
  const { f, fb } = await sheetFonts(doc);
  let pg: PDFPage = doc.addPage([612, 792]); let y = 740; const X = 54, W = 504; let pageNo = 1;
  const foot = () => pg.drawText(safe(`${es ? 'Página' : 'Page'} ${pageNo}  ·  ${p.site.address || p.name}`), { x: X, y: 36, size: 8, font: f, color: MUTE });
  const need = (h: number) => { if (y - h < 60) { foot(); pg = doc.addPage([612, 792]); pageNo++; y = 740; } };
  const line = (s: string, size = 10, font = f, color = INK, indent = 0) => { for (const l of wrap(safe(s), font, size, W - indent)) { need(size + 4); pg.drawText(l, { x: X + indent, y, size, font, color }); y -= size + 4; } };
  line(es ? 'Notas de campo, no un registro oficial de inspección de la ciudad' : 'Field notes, not an official city inspection record', 9, f, MUTE); y -= 10;
  line(es ? 'Registro de visita a la obra' : 'Site visit record', 20, fb);
  line(`${p.site.address || '-'}   APN ${p.site.apn || '-'}`, 10, f, MUTE);
  line(`${es ? 'Inspector' : 'Inspector'}: ${ins?.inspector || '-'}   ${es ? 'Fecha' : 'Date'}: ${ins?.date || '-'}`, 10, f, INK); y -= 4;
  line(`${es ? 'Cumple' : 'Pass'} ${t.pass}  ·  ${es ? 'No cumple' : 'Fail'} ${t.fail}  ·  ${es ? 'No aplica' : 'N/A'} ${t.na}  ·  ${es ? 'Sin revisar' : 'Not checked'} ${t.open}  ·  ${es ? 'Fotos' : 'Photos'} ${t.photos}`, 11, fb, t.fail ? RED : INK);
  if (conf.size) line(es ? `${conf.size} resultado(s) Cumple anulan una revisión que falla en la app (ver abajo).` : `${conf.size} Pass result${conf.size === 1 ? '' : 's'} override${conf.size === 1 ? 's' : ''} a check that fails in the app (see below).`, 10, fb, RED);
  if (ins?.general) { y -= 4; line(es ? 'Notas generales' : 'General notes', 10, fb); line(ins.general, 10, f, INK); }
  y -= 8;
  let group = '';
  for (const it of INSP_ITEMS) {
    const r = result(ins, it.id);
    if (it.group !== group) { group = it.group; need(30); y -= 6; line(GROUPS[it.group][lang], 12, fb); pg.drawLine({ start: { x: X, y: y + 10 }, end: { x: X + W, y: y + 10 }, thickness: 0.6, color: MUTE }); y -= 2; }
    const [lab, col] = r.s === 'pass' ? [es ? 'CUMPLE' : 'PASS', GREEN] : r.s === 'fail' ? [es ? 'NO CUMPLE' : 'FAIL', RED] : r.s === 'na' ? [es ? 'NO APLICA' : 'N/A', GREY] : [es ? 'SIN REVISAR' : 'NOT CHECKED', MUTE];
    need(34); pg.drawText(lab, { x: X, y, size: 9, font: fb, color: col });
    const txt = wrap(safe(it[lang]), fb, 10, W - 80); txt.forEach((l, i) => { if (i) need(14); pg.drawText(l, { x: X + 80, y, size: 10, font: fb, color: INK }); y -= 14; });
    line([it.sheet.length ? (es ? `Lista de correcciones LADBS, punto ${it.sheet.join(', ')}` : `LADBS correction list item ${it.sheet.join(', ')}`) : '', it.code].filter(Boolean).join('  ·  ') + (r.at ? `  ·  ${r.at.slice(0, 16).replace('T', ' ')}` : ''), 8, f, MUTE, 80);
    const af = appFails(p, rep, it.id, lang);
    if (af.length) line((es ? 'Las revisiones de la app no cumplen este punto: ' : "The app's checks fail this item: ") + af.join(' '), 8, fb, RED, 80);
    if (conf.has(it.id)) line(es ? `Cumple en campo anula la revisión de la app. Motivo: ${r.note || '(sin motivo)'}` : `Field Pass overrides the app's failing check. Reason: ${r.note || '(none given)'}`, 9, fb, RED, 80);
    else if (r.note) line(r.note, 9, f, INK, 80);
    if (r.photo) {
      const bytes = photos[r.photo];
      if (bytes) { try { const img = await doc.embedJpg(bytes); const k = Math.min(200 / img.width, 150 / img.height); const w = img.width * k, h = img.height * k; need(h + 8); pg.drawImage(img, { x: X + 80, y: y - h + 8, width: w, height: h }); y -= h + 6; }
        catch { line(es ? '(no se pudo leer la foto)' : '(the photo could not be read)', 8, f, MUTE, 80); } }
      else line(es ? '(la foto no está en este dispositivo)' : '(photo not on this device)', 8, f, MUTE, 80);
    }
    y -= 6;
  }
  y -= 6; line(es ? 'Hecho en un teléfono con Open Permit Hub. Solo la ciudad aprueba la obra.' : 'Made on a phone with Open Permit Hub. Only the city approves the work.', 8, f, MUTE);
  foot();
  return doc.save();
}
