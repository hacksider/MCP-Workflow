import { beforeEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),connect:vi.fn(),onEvent:vi.fn(),rejectRequest:vi.fn(),invoke:vi.fn()}));
vi.mock("../src/bridge",()=>mocks);
vi.mock("@tauri-apps/api/core",()=>({invoke:mocks.invoke}));
import { generateWorkflow } from "../src/builderRuntime";
import { newWorkflow,newStep } from "../src/workflow";
import { defaultProvider } from "../src/providers";
const base={...newWorkflow(),cwd:"C:/work",provider:defaultProvider};
const flow={...newWorkflow(),steps:[{...newStep("instruction"),id:"write",instructions:"Summarize the input",next:"$end"}]};
const report={status:"completed",summary:"Draft ready",outputs:JSON.stringify(flow)};
describe("workflow generation transport",()=>{
  let handler:(e:any)=>void,unlisten:ReturnType<typeof vi.fn>;
  beforeEach(()=>{
    vi.clearAllMocks();unlisten=vi.fn();
    mocks.onEvent.mockImplementation(async(fn)=>{handler=fn;return unlisten;});
    mocks.rpc.mockImplementation(async(method)=>{
      if(method==="config/read")return {config:{mcp_servers:{catalog:{command:"catalog"}}}};
      if(method==="thread/start")return {thread:{id:"draft-thread"}};
      if(method==="turn/start"){
        queueMicrotask(()=>handler({method:"turn/completed",params:{threadId:"draft-thread",turn:{status:"completed",items:[{type:"agentMessage",text:JSON.stringify(report)}]}}}));
        return {turn:{id:"draft-turn"}};
      }
    });
  });
  it("uses an isolated read-only planning turn, validates output, and cleans up the listener",async()=>{
    const result=await generateWorkflow("Summarize input",base,new AbortController().signal,()=>{});
    expect(result.workflow.steps[0].id).toBe("write");expect(unlisten).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("thread/start",expect.objectContaining({sandbox:"read-only",approvalPolicy:"never",config:expect.objectContaining({"mcp_servers.catalog.enabled":false,"features.shell_tool":false})}));
  });
  it("does not generate after cancellation, or without a workspace",async()=>{
    const stop=new AbortController();stop.abort();
    await expect(generateWorkflow("task",base,stop.signal,()=>{})).rejects.toThrow("stopped");
    await expect(generateWorkflow("task",{...base,cwd:""},new AbortController().signal,()=>{})).rejects.toThrow("workspace");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes design-only mode to Claude providers and validates their structured result",async()=>{
    mocks.invoke.mockResolvedValue({report});
    const result=await generateWorkflow("task",{...base,provider:{...defaultProvider,kind:"claude"}},new AbortController().signal,()=>{});
    expect(result.workflow.name).toBe(flow.name);
    expect(mocks.invoke).toHaveBeenCalledWith("claude_turn",{request:expect.objectContaining({designOnly:true})});
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("rejects generation failures without adding an executable draft",async()=>{
    mocks.invoke.mockResolvedValue({report:{status:"blocked",summary:"Sign in first"}});
    await expect(generateWorkflow("task",{...base,provider:{...defaultProvider,kind:"claude"}},new AbortController().signal,()=>{})).rejects.toThrow("Sign in first");
  });
});
