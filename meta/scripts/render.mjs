// Deliverable artwork creation only: does not open or inspect the product UI.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.resolve(root,'../../../package.json'));
const {chromium}=require('@playwright/test');const sharp=require('sharp');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/copy-status.json'),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
try{
for(const lang of data.localeCodes){const dir=path.join(root,'languages',lang,'screenshots');fs.mkdirSync(dir,{recursive:true});
for(let scene=1;scene<=5;scene++){await page.goto(pathToFileURL(path.join(root,'visuals/index.html')).href+`?lang=${lang}&scene=${scene}`);await page.evaluate(()=>window.artworkReady);const png=await page.screenshot();await sharp(png).flatten({background:'#eef4ff'}).removeAlpha().png().toFile(path.join(dir,`${scene}.png`));if(lang==='en')fs.copyFileSync(path.join(dir,`${scene}.png`),path.join(root,`images/screenshots/${scene}.png`));}
console.log(`Created five screenshots: ${lang}`);}
for(let v=1;v<=5;v++)for(const [size,width,height]of [['small',440,280],['marquee',1400,560]]){await page.setViewportSize({width,height});await page.goto(pathToFileURL(path.join(root,'visuals/promo.html')).href+`?v=${v}&size=${size}`);await page.evaluate(()=>document.fonts.ready);const png=await page.screenshot();await sharp(png).flatten({background:'#0b57d0'}).removeAlpha().png().toFile(path.join(root,`promo/variants/${v}-${size}-${width}x${height}.png`));}
const cards=[];for(let v=1;v<=5;v++){cards.push({input:await sharp(path.join(root,`promo/variants/${v}-small-440x280.png`)).resize(440,280).toBuffer(),left:30,top:(v-1)*310+30});cards.push({input:await sharp(path.join(root,`promo/variants/${v}-marquee-1400x560.png`)).resize(700,280).toBuffer(),left:500,top:(v-1)*310+30});}await sharp({create:{width:1230,height:1580,channels:3,background:'#e1e8f2'}}).composite(cards).jpeg({quality:92}).toFile(path.join(root,'promo/variants/overview.jpg'));
console.log('Created ten promo options and contact sheet. No default promo was selected.');
}finally{await browser.close()}
