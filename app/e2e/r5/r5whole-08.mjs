// r5whole-08: README, CHANGELOG and PRIVACY_NOTES do not describe what the app does now.
// Run: node r5whole-08.mjs   (reads /home/claude/opa)
import fs from 'fs'; const R = new URL('../../../', import.meta.url).pathname; const rd = f => fs.readFileSync(R + f, 'utf8'); const bad = [];
const readme = rd('README.md'), cl = rd('CHANGELOG.md'), priv = rd('docs/PRIVACY_NOTES.md'), srv = rd('mcp/src/server.ts');
if (!/field mode|site visit/i.test(readme)) bad.push('README never mentions inspector field mode');
if (!/plan[- ]set/i.test(readme)) bad.push('README never mentions the plan-set PDF pre-check');
if (!/review|pins?|notes/i.test(readme.split('## Run it')[0])) bad.push('README "What\'s in here" lists app as Lot, garage, rooms, checks, export: no Review step');
if (/everything the app does/.test(readme) && !/plan_check|plancheck|inspection|site_visit/.test(srv)) bad.push('README says the MCP server does "everything the app does" but it has no plan-set check or site-visit tool');
if (!/field mode|site visit|plan[- ]set/i.test(cl)) bad.push('CHANGELOG stops at 0.2.0 (round 1): no entry for plan-set check, field mode, parcel lookup, rooms, readiness, plain answer');
if (!/photo/i.test(priv)) bad.push('PRIVACY_NOTES says nothing about site-visit photos kept on the device (IndexedDB) or carried in .permitpack');
if (bad.length) { console.error('FAIL\n- ' + bad.join('\n- ')); process.exit(1); } console.log('PASS');
