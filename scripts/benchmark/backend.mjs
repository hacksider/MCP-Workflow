import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function createBackend(folder,fixture) {
  const exe=path.join(repo,'src-tauri/target/release/workflow-benchmark-backend'+(process.platform==='win32'?'.exe':''));
  const child=spawn(exe,[folder,fixture],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let resolveReady,rejectReady,current=null;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{try{const message=JSON.parse(line);if(message.ready)resolveReady();else if(current){const pending=current;current=null;message.error?pending.reject(Error(message.error)):pending.resolve(message.result);}}catch(e){current?.reject(e);current=null;}});
  let stderr='';child.stderr.on('data',s=>{stderr+=s.toString().slice(0,2000);});
  child.on('error',error=>{rejectReady(error);current?.reject(error);});
  child.on('exit',code=>{const error=Error(`Benchmark backend exited (${code}): ${stderr}`);rejectReady(error);current?.reject(error);});
  await ready;
  let queue=Promise.resolve();
  return {
    invoke(method,params){const work=()=>new Promise((resolve,reject)=>{current={resolve,reject};child.stdin.write(JSON.stringify({method,params})+'\n');});const result=queue.then(work);queue=result.catch(()=>{});return result;},
    close(){lines.close();child.stdin.end();child.kill();},
  };
}
export async function appendEvent(folder,event) {await fs.appendFile(path.join(folder,'operations.jsonl'),JSON.stringify({...event,at:Date.now()})+'\n');}
