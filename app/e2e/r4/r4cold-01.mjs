// Desktop Lot form: Street address must come first and fields must sit on a clean grid.
import { chromium } from './_ui.mjs';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(process.env.BASE); await p.click('text=Start my project');
const y=async s=>(await p.locator('label',{hasText:s}).first().boundingBox()).y;
const addr=await y('Street address'); const look=await y('Fill in from the city parcel map');
const apn=await y('Parcel number (APN)'); const zone=await y('Zone'); const legal=await y('Legal description (tract, block and lot)');
const bad=[]; if(look<addr) bad.push('Look-up block starts above the Street address label');
if(Math.abs(zone-legal)>8) bad.push(`Zone/Legal labels misaligned by ${Math.round(zone-legal)}px`);
await b.close(); if(bad.length){console.error('FAIL',bad);process.exit(1)} console.log('PASS');
