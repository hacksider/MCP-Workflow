import fs from 'node:fs/promises';
import path from 'node:path';
export function parseCsv(text) {
  const records=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){records.push(row);row=[];}}
    else cell+=c;
  }
  if(quoted)throw Error('Unclosed CSV quote');
  if(cell||row.length){row.push(cell.replace(/\r$/,''));records.push(row);}
  const headers=records.shift()??[];
  if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV headers');
  if(records.some(r=>r.length!==headers.length))throw Error('Inconsistent CSV columns');
  return {headers,rows:records.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))};
}
export function scoreRows(actual,expected) {
  const keys=['asin','title','price','url'];
  const seen=new Set();let correct=0,extra=0,duplicates=0;
  for(const row of actual){if(seen.has(row.asin))duplicates++;seen.add(row.asin);if(!expected.some(e=>e.asin===row.asin))extra++;}
  for(const row of expected){const matches=actual.filter(a=>a.asin===row.asin);if(matches.length===1)for(const k of keys)if(matches[0][k]===row[k])correct++;}
  const exact=correct===expected.length*keys.length&&actual.length===expected.length&&!duplicates&&!extra&&actual.every(r=>Object.keys(r).sort().join(',')===keys.slice().sort().join(','));
  return {correctFields:correct,expectedFields:expected.length*keys.length,exact,extraRows:extra,duplicateRows:duplicates,rows:actual.length};
}
export async function validateOutputs(folder,expected) {
  const files=await fs.readdir(folder),csv=files.filter(f=>f.endsWith('.csv')),json=files.filter(f=>/^products-.*\.json$|^amazon-demo-products-.*\.json$/.test(f));
  let csvScore={correctFields:0,expectedFields:expected.length*4,exact:false},jsonScore={...csvScore},error='';
  try{if(csv.length!==1)throw Error(`Expected one CSV, got ${csv.length}`);const parsed=parseCsv(await fs.readFile(path.join(folder,csv[0]),'utf8'));csvScore=scoreRows(parsed.rows,expected);}catch(e){error+=String(e)+'; ';}
  try{if(json.length!==1)throw Error(`Expected one JSON export, got ${json.length}`);jsonScore=scoreRows(JSON.parse(await fs.readFile(path.join(folder,json[0]),'utf8')),expected);}catch(e){error+=String(e)+'; ';}
  return {csv:csv[0]??null,json:json[0]??null,csvScore,jsonScore,correctFields:Math.min(csvScore.correctFields,jsonScore.correctFields),expectedFields:expected.length*4,outputsCorrect:csvScore.exact&&jsonScore.exact,error};
}
export function pacingValid(events) {
  let lastWait=0,fetches=0;
  for(const e of events){if(e.phase==='end'&&e.tool==='catalog_wait'&&e.durationMs>=2950)lastWait=e.at;
    if(e.phase==='start'&&e.tool==='catalog_fetch_page'){fetches++;if(!lastWait)return false;lastWait=0;}}
  return fetches===2;
}
