import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {repo,createBackend,appendEvent} from './backend.mjs';
import {freezeCase,sha256} from './fixtures.mjs';
import {validateOutputs,pacingValid} from './validate.mjs';
import {CodexClient} from './codex-client.mjs';

const pilot=process.argv.includes('--pilot');
const count=pilot?1:10;
const id=`${pilot?'pilot':'measured'}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const published=path.join(repo,'benchmarks/results',id);
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'mcp-workflow-benchmark-'));
await fs.mkdir(published,{recursive:true});
const enginePath=path.join(scratch,'production-engine.mjs');
await build({entryPoints:[path.join(repo,'scripts/benchmark/engine.ts')],outfile:enginePath,bundle:true,platform:'node',format:'esm',plugins:[{name:'native-transport-only',setup(build){build.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'invoke-adapter',namespace:'benchmark'}));build.onLoad({filter:/.*/,namespace:'benchmark'},()=>({contents:'export const invoke=(method,params)=>globalThis.__benchmarkInvoke(method,params);',loader:'js'}));}}]});
const engineUrl=pathToFileURL(enginePath).href;
const engine=await import(engineUrl);
const template=JSON.parse(await fs.readFile(path.join(repo,'examples/amazon-scraper-demo.json'),'utf8'));
let binary=process.env.MCP_WORKFLOW_CODEX;
if(!binary){const root=path.join(process.env.LOCALAPPDATA||'','OpenAI/Codex/bin');const candidates=[];for(const entry of await fs.readdir(root)){const exe=path.join(root,entry,'codex.exe');try{candidates.push({exe,mtime:(await fs.stat(exe)).mtimeMs});}catch{}}binary=candidates.sort((a,b)=>b.mtime-a.mtime)[0]?.exe||'codex';}
const prompt=`Use only the workflow_benchmark MCP catalog tools to complete this task. Do not use shell, code execution, external websites, saved workflows or prior results. Start at fixture://amazon-demo/page-1. Before EACH page fetch, call catalog_wait for 3 seconds. Fetch the page, read all product rows, follow the next-page link until absent, and stop after at most 3 pages. Collect asin, title, price and url. Select rows with [data-asin]. asin is the row's data-asin attribute; title is h2 text; price is .a-offscreen text (optional: use an empty string if absent); url is .product-link href. Pagination is .s-pagination-next href. Deduplicate by asin, preserving the FIRST occurrence across pages. Keep the products dataset and its live CSV updated as pages are collected. Then export that same dataset as CSV and JSON, name products, using the export tool. Finish all tools before reporting completed. Do not guess missing facts or copy previous outputs. Return failed or blocked if unable to complete. The files must contain exactly the unique products present in the fetched pages and exactly those four fields.`;
await fs.writeFile(path.join(published,'prompt.txt'),prompt);
await fs.writeFile(path.join(published,'workflow.json'),JSON.stringify(template,null,2));
const meta={id,pilot,dateUTC:new Date().toISOString(),timezone:'Asia/Manila',pairs:count,timeoutSeconds:180,delaySeconds:3,node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,codeCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),codexVersion:execFileSync(binary,['--version'],{encoding:'utf8',windowsHide:true}).trim(),templateSha256:sha256(JSON.stringify(template)),promptSha256:sha256(prompt),engineSha256:sha256(await fs.readFile(enginePath)),scope:'Headless production workflow executor and native Rust backend versus prompt-driven Codex with the same native operations exposed via MCP. No UI/browser rendering or live network scraping. Includes method setup, 6 seconds of deliberate pacing, execution, agent completion and independent validation. Excludes building/configuring the reusable workflow, compilation, and fixture generation.'};
await fs.writeFile(path.join(published,'metadata.json'),JSON.stringify(meta,null,2));
console.log(`Benchmark ${id}; ${count} paired case(s). Evidence: ${published}`);
const records=[];
let frozenModel=null,frozenEffort=null;
for(let pair=1;pair<=count;pair++){
  const frozen=await freezeCase(repo,pair,path.join(published,'fixtures'));
  await fs.writeFile(path.join(published,'fixtures',`expected-${pair}.json`),JSON.stringify(frozen.expected,null,2));
  for(const method of pair%2?['agent','workflow']:['workflow','agent']){
    const folder=path.join(scratch,`${pair}-${method}`);await fs.mkdir(folder);
    const start=performance.now();let error='',completed=false,visits=0,setupMs=0,model=null,effort=null,tokens=null,backend,client;
    try{
      if(method==='workflow'){
        backend=await createBackend(folder,frozen.fixturePath);
        globalThis.__benchmarkInvoke=(name,params)=>backend.invoke(name,params);
        const workflow=engine.parseWorkflow(JSON.stringify({...template,cwd:folder}));
        const context=engine.newContext();setupMs=performance.now()-start;
        await engine.runGraph(workflow,context,async({step},ctx,control)=>{
          visits++;const tool=({wait:'catalog_wait',fetch:'catalog_fetch_page',extract:'catalog_extract_rows',collect:'catalog_collect_rows',export:'catalog_export_rows'})[step.kind]||step.kind;
          await appendEvent(folder,{phase:'start',tool,stepId:step.id});const began=performance.now();
          const result=await engine.executeNativeStep(step,ctx,folder,()=>control.signal.aborted,control.heartbeat);
          ctx.steps[step.id]={summary:result.summary,outputs:JSON.parse(result.outputs)};
          await appendEvent(folder,{phase:'end',tool,stepId:step.id,durationMs:performance.now()-began});
        },()=>performance.now()-start>180000,()=>{});
        completed=performance.now()-start<=180000;
      }else{
        client=new CodexClient(binary);await client.initialize();
        const account=await client.rpc('account/read');if(account.account?.type!=='chatgpt')throw Error('Benchmark requires the existing ChatGPT subscription session, not an API key');
        const effective=await client.rpc('config/read',{includeLayers:false});
        const models=await client.rpc('model/list',{});
        frozenModel ??= effective.config?.model||models.data.find(m=>m.isDefault)?.model||models.data[0]?.model;
        model=frozenModel;
        if(!model)throw Error('No model available to the subscription');
        frozenEffort ??= effective.config?.model_reasoning_effort||'medium';
        effort=frozenEffort;
        const config={'features.shell_tool':false,'features.multi_agent':false,'features.plugins':false,'features.apps':false,'web_search':'disabled','apps._default.enabled':false,'model_reasoning_effort':effort};
        for(const name of Object.keys(effective.config?.mcp_servers||{})){if(!/^[\w-]+$/.test(name))throw Error('Cannot isolate configured server');config[`mcp_servers.${name}.enabled`]=false;}
        config['mcp_servers.workflow_benchmark']={command:process.execPath,args:[path.join(repo,'scripts/benchmark/mcp-server.mjs'),folder,frozen.fixturePath,engineUrl],enabled:true,required:true,startup_timeout_sec:30,tool_timeout_sec:60};
        const started=await client.rpc('thread/start',{cwd:folder,model,modelProvider:'openai',config,approvalPolicy:'never',sandbox:'workspace-write',ephemeral:true,developerInstructions:'Complete the supplied benchmark task using only workflow_benchmark MCP tools. Do not inspect repository files, use other integrations or run code. This is a local fictional dataset, not live Amazon. Do not fabricate execution. No subagents.'});
        setupMs=performance.now()-start;
        const turn=await client.run(started.thread.id,prompt,180);
        tokens=client.tokens;
        const final=(turn.items?.length?turn.items:client.items).filter(i=>i.type==='agentMessage').at(-1)?.text||'';
        let report;try{report=JSON.parse(final);}catch{}
        completed=turn.status==='completed'&&report?.status==='completed';
        if(!completed)error=turn.error?.message||report?.summary||`Agent ended ${turn.status}`;
        await fs.writeFile(path.join(folder,'agent-report.json'),JSON.stringify({status:turn.status,report,model,effort,tokens,errors:client.errors},null,2));
      }
    }catch(e){error=String(e);}
    const score=await validateOutputs(folder,frozen.expected);
    let events=[];try{events=(await fs.readFile(path.join(folder,'operations.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}
    const elapsedMs=performance.now()-start;
    const paced=pacingValid(events),success=completed&&score.outputsCorrect&&paced&&elapsedMs<=180000;
    const record={pair,case:frozen.label,method,elapsedSeconds:elapsedMs/1000,setupSeconds:setupMs/1000,success,completed,pacingValid:paced,correctFields:score.correctFields,expectedFields:score.expectedFields,fieldAccuracy:score.correctFields/score.expectedFields,csv:score.csv,json:score.json,csvScore:score.csvScore,jsonScore:score.jsonScore,toolCalls:events.filter(e=>e.phase==='start'&&e.tool.startsWith('catalog_')).length,toolErrors:events.filter(e=>e.phase==='error').length,workflowVisits:method==='workflow'?visits:null,model,reasoningEffort:effort,tokens,error:error||score.error||'',fixtureSha256:frozen.hash,humanCorrections:0};
    records.push(record);
    await fs.appendFile(path.join(published,'runs.jsonl'),JSON.stringify(record)+'\n');
    await fs.cp(folder,path.join(published,`${pair}-${method}`),{recursive:true});
    backend?.close();client?.close();
    console.log(`Pair ${pair}/${count} ${frozen.label}: ${method} ${record.elapsedSeconds.toFixed(2)}s; fields ${record.correctFields}/${record.expectedFields}; success=${success}${record.error?' '+record.error:''}`);
    if(pilot&&!success)console.log('Pilot failure: inspect evidence before the measured run. Pilot is never pooled with measurements.');
  }
}
await fs.writeFile(path.join(published,'runs.json'),JSON.stringify(records,null,2));
const summary={};
for(const method of ['agent','workflow']){
  const rows=records.filter(r=>r.method===method),times=rows.map(r=>r.elapsedSeconds).sort((a,b)=>a-b),n=rows.length;
  summary[method]={runs:n,successful:rows.filter(r=>r.success).length,successRate:rows.filter(r=>r.success).length/n,meanSeconds:times.reduce((a,b)=>a+b,0)/n,medianSeconds:n%2?times[Math.floor(n/2)]:(times[n/2-1]+times[n/2])/2,minSeconds:times[0],maxSeconds:times.at(-1),fieldAccuracy:rows.reduce((n,r)=>n+r.correctFields,0)/rows.reduce((n,r)=>n+r.expectedFields,0),toolErrors:rows.reduce((n,r)=>n+r.toolErrors,0)};
}
summary.speedup=summary.agent.meanSeconds/summary.workflow.meanSeconds;
await fs.writeFile(path.join(published,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
console.log(`FINISHED ${published}`);
