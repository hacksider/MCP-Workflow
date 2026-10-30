import { invoke } from "@tauri-apps/api/core";
import { connect, onEvent, rpc, rejectRequest } from "./bridge";
import { codexProviderOptions, defaultProvider, isClaude } from "./providers";
import { CompletionGuard, outcomeSchema, type Workflow } from "./workflow";
import { builderPrompt, validateGeneratedDraft } from "./builder";

export async function generateWorkflow(request: string, base: Workflow, signal: AbortSignal, progress: (message: string) => void) {
  const prompt = builderPrompt(request), provider = base.provider ?? defaultProvider;
  if (!base.cwd.trim()) throw Error("Choose a workspace folder in Workflow settings first.");
  if (signal.aborted) throw Error("Generation stopped.");
  let text: string, summary: string;
  if (isClaude(provider)) {
    const stop = () => { void invoke("claude_control", {message:{type:"stop"}}).catch(()=>{}); };
    signal.addEventListener("abort", stop, {once:true});
    try {
      const result = await invoke<any>("claude_turn", {request:{cwd:base.cwd,provider,schema:outcomeSchema,prompt,designOnly:true}});
      if (result.report.status !== "completed") throw Error(result.report.summary || "The provider could not design this workflow.");
      text = result.report.outputs; summary = result.report.summary;
    } finally { signal.removeEventListener("abort", stop); }
  } else {
    await connect();
    // Disable external tools in this isolated planning thread, without changing shared config.
    const config: Record<string, unknown> = {"features.shell_tool":false,"features.multi_agent":false,"features.plugins":false,"features.apps":false,"web_search":"disabled","apps._default.enabled":false};
    // Status includes host-injected tools with no configurable transport. Only override
    // real config entries; inventing an enabled-only server fails transport validation.
    const effective = await rpc("config/read", {includeLayers:false});
    for (const name of Object.keys(effective.config?.mcp_servers ?? {})) {
      if (!/^[\w-]+$/.test(name)) throw Error("Cannot isolate this MCP server for workflow design.");
      config[`mcp_servers.${name}.enabled`] = false;
    }
    if (signal.aborted) throw Error("Generation stopped.");
    const started = await rpc("thread/start", {cwd:base.cwd,...codexProviderOptions(provider),config:{...codexProviderOptions(provider).config,...config},approvalPolicy:"never",sandbox:"read-only",ephemeral:true,developerInstructions:"Design a workflow from the supplied specification. No tool calls or task execution. Return only the requested structured outcome."});
    const id = started.thread.id;
    let turnId: string | undefined, finalText = "", finish!: (value:any)=>void;
    let abortTimeout: ReturnType<typeof setTimeout> | undefined;
    const guard = new CompletionGuard();
    const completion = new Promise<any>(resolve=>{finish=resolve;});
    const interrupt = () => {
      if (turnId) void rpc("turn/interrupt",{threadId:id,turnId}).catch(()=>{});
      abortTimeout ??= setTimeout(()=>finish({status:"interrupted",error:{message:"Generation stopped. The provider did not acknowledge cancellation."}}),10000);
    };
    const unlisten = await onEvent(e=>{
      if (e.params?.threadId !== id) return;
      if (e.id !== undefined) { void rejectRequest(e.id); return; }
      guard.observe(e.method,e.params?.item);
      if(e.method === "turn/started") {turnId=e.params.turn.id;if(signal.aborted)interrupt();}
      if(e.method === "item/completed" && e.params.item?.type === "agentMessage") finalText=e.params.item.text;
      if(e.method === "item/agentMessage/delta") progress("AI is designing the steps and connections…");
      if(e.method === "turn/completed") finish(e.params.turn);
    });
    signal.addEventListener("abort",interrupt,{once:true});
    try {
      if (signal.aborted) throw Error("Generation stopped.");
      const result = await rpc("turn/start",{threadId:id,input:[{type:"text",text:prompt,text_elements:[]}],outputSchema:outcomeSchema});
      turnId=result.turn.id;
      if(signal.aborted)interrupt();
      const finished=await completion;
      const report=guard.finish(finished,finalText || finished.items?.filter((x:any)=>x.type === "agentMessage").at(-1)?.text || "");
      if(report.status!=="completed")throw Error(report.summary);
      text=report.outputs;summary=report.summary;
    } finally {
      if (abortTimeout) clearTimeout(abortTimeout);
      signal.removeEventListener("abort",interrupt);unlisten();
    }
  }
  if(signal.aborted)throw Error("Generation stopped.");
  const draft=validateGeneratedDraft(text,base);
  return {...draft,summary};
}
