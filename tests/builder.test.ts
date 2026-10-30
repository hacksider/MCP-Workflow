import { describe,it,expect } from "vitest";
import { builderPrompt, validateGeneratedDraft } from "../src/builder";
import { newWorkflow,newStep, type Workflow } from "../src/workflow";
import { defaultProvider } from "../src/providers";
import { runGraph,newContext } from "../src/routing";
import { executeNativeStep } from "../src/native";

const base={...newWorkflow(),cwd:"C:/work",provider:defaultProvider};
const sample=():Workflow=>({...newWorkflow(),steps:[{...newStep("wait"),id:"pause",wait:{seconds:0},next:"count"},{...newStep("counter"),id:"count",counter:{limit:3,below:"pause",after:"$end"}}],startStepId:"pause"});
describe("AI workflow drafts",()=>{
  it("creates an independently identified graph and preserves the user's workspace/provider",async()=>{
    const raw={...sample(),cwd:"C:/invented",provider:{...defaultProvider,kind:"openai-api"},id:base.id};
    const {workflow}=validateGeneratedDraft(JSON.stringify(raw),base);
    expect(workflow.id).not.toBe(base.id);expect(workflow.cwd).toBe(base.cwd);expect(workflow.provider).toEqual(defaultProvider);
    const context=newContext();let visits=0;
    await runGraph(workflow,context,async({step},ctx)=>{visits++;const r=await executeNativeStep(step,ctx,base.cwd,()=>false);ctx.steps[step.id]={summary:r.summary,outputs:JSON.parse(r.outputs)};},()=>false,()=>{});
    expect(visits).toBe(6);expect(context.steps.count.outputs.count).toBe(3);
  });
  it("rejects dangling routes, disconnected steps and paths with no exit",()=>{
    const invalid=sample();invalid.steps[0].next="missing";expect(()=>validateGeneratedDraft(JSON.stringify(invalid),base)).toThrow("Missing destination");
    const disconnected=sample();disconnected.steps.push({...newStep("wait"),id:"orphan",next:"$end"});expect(()=>validateGeneratedDraft(JSON.stringify(disconnected),base)).toThrow("reachable");
    const stuck=sample();stuck.steps[1].counter!.after="pause";expect(()=>validateGeneratedDraft(JSON.stringify(stuck),base)).toThrow("path to End");
  });
  it("rejects fake files and tool bindings while allowing incomplete upload drafts with clear notices",()=>{
    const upload:Workflow={...newWorkflow(),steps:[{...newStep("upload"),files:[]}]};
    expect(validateGeneratedDraft(JSON.stringify(upload),base).notices.join(" ")).toContain("select the files");
    upload.steps[0].files=[{name:"fake.pdf",path:"C:/fake.pdf",size:1}];expect(()=>validateGeneratedDraft(JSON.stringify(upload),base)).toThrow("invent");
    const tool={...newWorkflow(),steps:[newStep("tool")]};expect(()=>validateGeneratedDraft(JSON.stringify(tool),base)).toThrow("unsupported");
  });
  it("rejects malformed output and bounds requests, preserving the task as design data",()=>{
    expect(()=>builderPrompt(" ")).toThrow();expect(()=>builderPrompt("x".repeat(12001))).toThrow();
    expect(()=>validateGeneratedDraft("not json",base)).toThrow();
    expect(builderPrompt("scrape a catalog")).toContain("{{steps.EXTRACT_ID.outputs.rows}}");
  });
});
