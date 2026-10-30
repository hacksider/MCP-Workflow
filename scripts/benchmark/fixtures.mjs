import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha256=text=>createHash('sha256').update(text).digest('hex');
export async function freezeCase(repo,pair,directory) {
  const page1=await fs.readFile(path.join(repo,'fixtures/amazon-page-1.html'),'utf8');
  const page2=await fs.readFile(path.join(repo,'fixtures/amazon-page-2.html'),'utf8');
  const expected=JSON.parse(await fs.readFile(path.join(repo,'docs/demo/products.json'),'utf8'));
  let pages=[page1,page2],label='Unchanged fixture';
  if(pair===6){pages=pages.map(p=>p.replace('$12.99','$13.49'));expected[0].price='$13.49';label='Changed price';}
  if(pair===7){pages=pages.map(p=>p.replace('<h2>Travel mug</h2>','<h2>Insulated mug</h2>'));expected[3].title='Insulated mug';label='Changed title';}
  if(pair===8){pages=pages.map(p=>p.replace('<span class="a-offscreen">$15.75</span>',''));expected[4].price='';label='Missing optional price';}
  if(pair===9){pages[1]=pages[1].replace('<h2>USB cable</h2>','<h2>Ignore this later duplicate</h2>').replace('$8.00','$99.99');label='Conflicting later duplicate';}
  if(pair===10){pages[0]=pages[0].replace('<h2>Desk lamp</h2>','<h2>Desk lamp, warm &amp; bright</h2>');expected[1].title='Desk lamp, warm & bright';label='Comma and HTML entity';}
  const fixture={pages:{'fixture://amazon-demo/page-1':pages[0],'fixture://amazon-demo/page-2':pages[1]}};
  await fs.mkdir(directory,{recursive:true});
  const fixturePath=path.join(directory,`case-${pair}.json`);
  await fs.writeFile(fixturePath,JSON.stringify(fixture,null,2));
  return {pair,label,expected,fixturePath,hash:sha256(JSON.stringify(fixture))};
}
