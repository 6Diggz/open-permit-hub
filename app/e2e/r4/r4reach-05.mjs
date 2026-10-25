// Export step must tell an owner how to keep true scale when printing at home or at a print shop (Actual size / 100%, 24x36, scale bar check).
import { phone, demoExport } from './_ios.mjs';
const { b, pg } = await phone(); await demoExport(pg);
const t = await pg.locator('main').innerText(); await b.close();
if (!/(actual size|100\s?%)/i.test(t) || !/(scale bar|measure)/i.test(t)) { console.error('FAIL: no print-at-true-scale guidance on Export'); process.exit(1); }
console.log('PASS');
