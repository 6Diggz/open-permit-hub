// After a successful Look up with a "Likely yes" plain answer, the headline must not say "Some answers are missing". Needs network to maps.lacity.org.
import { chromium } from './_ui.mjs';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(process.env.BASE); await p.click('text=Start my project');
await p.getByLabel('Street address',{exact:true}).fill('4515 Russell Ave, Los Angeles, CA 90027');
await p.getByRole('button',{name:'Look up'}).click(); await p.getByText('Found 4515').waitFor({timeout:30000});
const card=await p.locator('[aria-live]').filter({hasText:'Check card'}).first().innerText();
await b.close();
if(/Likely yes/.test(card)&&/Some answers are missing/.test(card)){console.error('FAIL headline contradicts plain answer');process.exit(1)} console.log('PASS');
