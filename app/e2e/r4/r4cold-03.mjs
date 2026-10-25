// Street found by the LA City geocoder but parcel not matched: City must not stay "Not sure" with an "outside LA" style verdict.
import { chromium } from './_ui.mjs';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(process.env.BASE); await p.click('text=Start my project');
await p.getByLabel('Street address',{exact:true}).fill('10834 Wellworth Ave, Los Angeles, CA 90024');
await p.getByRole('button',{name:'Look up'}).click(); await p.getByText('street was found').waitFor({timeout:30000});
const city=await p.getByLabel('City',{exact:true}).inputValue();
const card=await p.locator('[aria-live]').filter({hasText:'Check card'}).first().innerText();
await b.close();
if(city==='unknown'&&/cover the City of Los Angeles only/.test(card)){console.error('FAIL city left unknown after LA street match');process.exit(1)} console.log('PASS');
