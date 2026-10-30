import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createBackend,appendEvent} from './backend.mjs';

const [folder,fixture,enginePath]=process.argv.slice(2);
if(!folder||!fixture||!enginePath)throw Error('Missing benchmark server arguments');
const backend=await createBackend(folder,fixture);
globalThis.__benchmarkInvoke=(method,params)=>backend.invoke(method,params);
const {executeNativeStep,newContext,newStep}=await import(enginePath);
const context=newContext();
const server=new McpServer({name:'workflow-benchmark-mcp-server',version:'1.0.0'});
const read={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const write={...read,readOnlyHint:false,idempotentHint:false};
function tool(name,description,schema,annotations,fn) {
  server.registerTool(name,{title:name.replaceAll('_',' '),description,inputSchema:z.object(schema).strict(),annotations},async(args)=>{
    const began=performance.now();await appendEvent(folder,{phase:'start',tool:name,args});
    try {const data=await fn(args);await appendEvent(folder,{phase:'end',tool:name,durationMs:performance.now()-began});return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};}
    catch(error){await appendEvent(folder,{phase:'error',tool:name,error:String(error),durationMs:performance.now()-began});return {content:[{type:'text',text:String(error)}],isError:true};}
  });
}
tool('catalog_wait','Wait for the given duration before making a page request.',{seconds:z.number().min(0).max(30)},read,async({seconds})=>{
  const result=await executeNativeStep({...newStep('wait'),wait:{seconds}},context,folder);return JSON.parse(result.outputs);
});
tool('catalog_fetch_page','Fetch one of the two frozen catalog pages. Returns the actual HTML and URL. Accepts fixture://amazon-demo/page-1 or page-2 only.',{url:z.string()},read,args=>backend.invoke('fetch_page',args));
tool('catalog_extract_rows','Extract structured rows and nextUrl from page HTML using CSS selectors. Empty selector selects the row itself. Empty attribute extracts text. Fields can be required.',{
  html:z.string().max(2097152),baseUrl:z.string(),rowSelector:z.string(),fields:z.array(z.object({name:z.string(),selector:z.string(),attribute:z.string(),required:z.boolean().optional()})).min(1).max(100),nextSelector:z.string()
},read,args=>backend.invoke('extract_rows',args));
tool('catalog_collect_rows','Append rows to a named dataset, deduplicating by uniqueKey. Preserve the first occurrence of each key. Writes a live CSV and returns its path and current row count.',{
  rows:z.array(z.record(z.string(),z.unknown())).max(10000),dataset:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),uniqueKey:z.string()
},write,async({rows,dataset,uniqueKey})=>{
  context.vars.inputRows=rows;
  const result=await executeNativeStep({...newStep('collect'),collect:{source:'{{vars.inputRows}}',dataset,uniqueKey,liveCsvName:'products'}},context,folder);
  return {...JSON.parse(result.outputs),csvPath:context.liveCsv?.[dataset]?.path};
});
tool('catalog_export_rows','Export an existing collected dataset as CSV or JSON inside this run folder. Returns the file path. CSV reuses the actual live file.',{
  dataset:z.string(),format:z.enum(['csv','json']),name:z.string().regex(/^[a-zA-Z0-9_-]+$/)
},write,async({dataset,format,name})=>{
  const result=await executeNativeStep({...newStep('export'),export:{dataset,format,name}},context,folder);return JSON.parse(result.outputs);
});
await fs.writeFile(path.join(folder,'mcp-ready.json'),JSON.stringify({ready:true,at:Date.now()}));
process.stdin.on('end',()=>backend.close());
process.on('SIGTERM',()=>{backend.close();process.exit();});
serveStdio(()=>server);
