import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
export class CodexClient {
  constructor(binary){
    this.pending=new Map();this.sequence=0;this.active=null;this.items=[];this.tokens=null;this.errors=[];
    this.child=spawn(binary,['app-server','--listen','stdio://'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.lines=createInterface({input:this.child.stdout});
    this.lines.on('line',line=>{try{this.message(JSON.parse(line));}catch(error){this.errors.push(String(error));}});
    this.child.stderr.on('data',()=>{});
    const fail=error=>{for(const p of this.pending.values())p.reject(error);this.pending.clear();this.active?.reject(error);};
    this.child.on('error',fail);this.child.on('exit',code=>fail(Error(`Codex exited (${code})`)));
  }
  rpc(method,params={}) {return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Codex RPC timeout: ${method}`));},60000);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});this.child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
  message(m){
    if(m.id!==undefined&&!m.method){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}return;}
    if(m.id!==undefined){this.child.stdin.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Benchmark has no human intervention; unsupported request'}})+'\n');return;}
    const p=m.params;if(!this.active||p?.threadId!==this.active.threadId)return;
    if(m.method==='item/completed')this.items.push(p.item);
    if(m.method==='thread/tokenUsage/updated')this.tokens=p.tokenUsage;
    if(m.method==='error')this.errors.push(p.error?.message||'Codex error');
    if(m.method==='turn/started')this.active.turnId=p.turn.id;
    if(m.method==='turn/completed')this.active.resolve(p.turn);
  }
  async initialize(){await this.rpc('initialize',{clientInfo:{name:'mcp_workflow_matched_benchmark',version:'1.0.0'},capabilities:{experimentalApi:true}});this.child.stdin.write('{"method":"initialized"}\n');}
  async run(threadId,prompt,seconds=180){
    const finished=new Promise((resolve,reject)=>{this.active={threadId,resolve,reject};});
    let rejectTimeout;const timeout=new Promise((_,reject)=>{rejectTimeout=setTimeout(()=>{if(this.active?.turnId)void this.rpc('turn/interrupt',{threadId,turnId:this.active.turnId}).catch(()=>{});reject(Error(`Benchmark timeout after ${seconds}s`));},seconds*1000);});
    try{const started=await this.rpc('turn/start',{threadId,input:[{type:'text',text:prompt,text_elements:[]}],outputSchema:{type:'object',properties:{status:{type:'string',enum:['completed','failed','blocked']},summary:{type:'string'}},required:['status','summary'],additionalProperties:false}});this.active.turnId=started.turn.id;return await Promise.race([finished,timeout]);}
    finally{clearTimeout(rejectTimeout);this.active=null;}
  }
  close(){this.active=null;this.lines.close();this.child.stdin.end();this.child.kill();}
}
