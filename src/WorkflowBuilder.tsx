import { useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { Workflow } from "./workflow";
import { validateGeneratedDraft, type GeneratedDraft } from "./builder";
import { GraphEditor } from "./GraphEditor";
import { providerLabel, defaultProvider } from "./providers";

export function WorkflowBuilder({base,onGenerate,onSave,onClose}:{base:Workflow;onGenerate:(prompt:string,signal:AbortSignal,progress:(s:string)=>void)=>Promise<GeneratedDraft & {summary:string}>;onSave:(w:Workflow)=>void;onClose:()=>void}) {
  const [prompt,setPrompt]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [draft,setDraft]=useState<(GeneratedDraft & {summary:string})|null>(null);
  const controller=useRef<AbortController|null>(null);
  async function generate() {
    if(busy)return;
    setBusy(true);setError("");setMessage("Connecting to your AI provider…");setDraft(null);
    const abort=new AbortController();controller.current=abort;
    const timeout=setTimeout(()=>{setMessage("Generation timed out. Stopping the provider…");abort.abort();},180000);
    try {setDraft(await onGenerate(prompt,abort.signal,setMessage));setMessage("");}
    catch(e){setError(String(e).replace(/^Error: /,""));}
    finally{clearTimeout(timeout);setBusy(false);controller.current=null;}
  }
  return <div className="modal-backdrop"><div className="modal ai-builder" role="dialog" aria-modal="true" aria-labelledby="builder-title">
    <div className="plugin-browser-title"><div><h2 id="builder-title"><Sparkles size={19}/> Build with AI</h2><p>Describe a repeatable task. Review the connected draft, then save it as a new workflow.</p></div><button disabled={busy} aria-label="Close AI builder" onClick={onClose}><X size={16}/></button></div>
    <p>Uses {providerLabel(base.provider??defaultProvider)} from Workflow settings. Generation uses AI usage. It does not run the workflow.</p>
    <label htmlFor="builder-prompt">What should your workflow do?</label>
    <textarea id="builder-prompt" rows={4} maxLength={12000} value={prompt} disabled={busy} onChange={e=>setPrompt(e.target.value)} placeholder="Read a product catalog, collect titles and prices, follow up to 3 pages, remove duplicates, and save a CSV. Wait 2 seconds between pages."/>
    <div className="builder-actions"><button className="primary" disabled={busy||!prompt.trim()} onClick={()=>void generate()}><Sparkles size={15}/>{draft?"Generate again":"Generate workflow"}</button>{busy&&<button onClick={()=>{controller.current?.abort();setMessage("Stopping generation…");}}>Stop generation</button>}</div>
    <div role="status" aria-live="polite">{busy&&message}</div>{error&&<p role="alert" className="builder-error">{error}</p>}
    {draft&&<><h3>{draft.workflow.name}</h3><p>{draft.summary}</p>{draft.notices.length>0&&<ul className="builder-notices">{draft.notices.map(n=><li key={n}>{n}</li>)}</ul>}
      <div className="builder-graph"><GraphEditor workflow={draft.workflow} onChange={w=>setDraft({...draft,workflow:w})} onSelect={()=>{}} selected={null} running={false} active={null} reachedEnd={false} runs={[]} now={0}/></div>
      <details><summary>Review all step instructions and settings ({draft.workflow.steps.length} steps)</summary>{draft.workflow.steps.map(s=><article className="builder-step" key={s.id}><strong>{s.name} · {s.kind}</strong><p>{s.instructions||s.documentation||"Native workflow step"}</p><pre>{JSON.stringify(s,null,2)}</pre></article>)}</details>
      <p>Review AI-generated instructions, inputs, selectors and write operations before running. Saving preserves your current workflow and does not start this one.</p>
      <button className="primary" onClick={()=>{try{onSave(validateGeneratedDraft(JSON.stringify(draft.workflow),base).workflow);}catch(e){setError(String(e));}}}>Save as new workflow</button>
    </>}
  </div></div>;
}
