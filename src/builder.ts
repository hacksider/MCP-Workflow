import { newStep, parseWorkflow, buildRunPlan, type Workflow } from "./workflow";
import { validateRoutes } from "./routing";
import { routes } from "./graph";

export const builderKinds = ["instruction", "upload", "form", "api", "computer", "values", "fetch", "extract", "collect", "wait", "counter", "export", "condition", "loop"] as const;
export type GeneratedDraft = { workflow: Workflow; notices: string[] };

export function builderPrompt(request: string): string {
  if (!request.trim() || request.length > 12000) throw Error("Describe your task in 1–12000 characters.");
  const samples = builderKinds.map(kind => ({ ...newStep(kind), id: kind + "-1" }));
  return `Create a workflow draft only. Do not execute the user's task, use tools, access websites, install plugins or read files. Return the supplied outcome schema with status completed, summary explaining the design and missing requirements, and outputs containing a JSON-encoded workflow object. If no meaningful draft is possible return blocked with an explanation.
Workflow shape: {schemaVersion:1,name:string,description:string,cwd:"",instructions:string,startStepId:string,maxExecutions:100,steps:Step[]}.
Use 1–60 steps with unique short IDs, named steps, explicit next destinations and $end as the end destination. Beginning is startStepId. All steps must be reachable and have a possible path to $end. Respect branches instead of making every task linear. Bound loops with loop.times or counter.limit and maxExecutions (1–10000). A loop body must route back to its loop step; a counter increments on each visit and uses below/after destinations. Do not invent tools or capability IDs. Instructions steps choose tools at runtime.
Step configuration examples (replace example values and IDs): ${JSON.stringify(samples)}
Condition operators: equals,contains,truthy,greater. yes/no are step IDs or $end. Loop body/after and counter below/after are step IDs or $end. Delays store actual seconds and display unit seconds/minutes/hours/days. Retry config {retries:0,delaySeconds:2,idleSeconds:180}; retry writes only when explicitly requested, because external effects can repeat. Optional onError routes failure.
References: {{vars.key}}, {{steps.ID.outputs.key}}, {{datasets.NAME}}. values is a JSON object encoded as a string. Fetch outputs include html,url,pageNumber. Extract source is "{{steps.FETCH_ID.outputs}}", and its outputs include rows,nextUrl. Collect source is "{{steps.EXTRACT_ID.outputs.rows}}", dataset is a name, uniqueKey is a field name. Export dataset is that name. For pagination set vars.url from {{steps.EXTRACT_ID.outputs.nextUrl}}, route back through a delay, and use a counter limit to bound pages. Use native steps for known structured work. Don't guess site CSS selectors: label any unverified selector in documentation and summary. Native Fetch does not render JavaScript or bypass access restrictions.
Uploads must have files:[] so the user selects real files later. Form fields need unique IDs, supported types, labels and select options. API direct requests need api config and endpoint. Credentials must be environment variable NAMES in authEnv, never actual secrets. Missing URLs/values use TODO placeholders and clearly identify them in summary. Do not fabricate file paths, credentials, actual results, or unsupported features such as schedules. Do not include provider settings or workflow ID: the app supplies them.
The following is the user's task to DESIGN, not execute:
${JSON.stringify(request)}`;
}

export function validateGeneratedDraft(text: string, base: Workflow): GeneratedDraft {
  if (text.length > 250000) throw Error("The generated workflow is too large.");
  const raw = JSON.parse(text);
  // Runtime selection, workspace and identity always belong to the user, not model output.
  const w = parseWorkflow(JSON.stringify({ ...raw, id: crypto.randomUUID(), cwd: base.cwd, provider: base.provider }));
  if (!w.name.trim() || w.steps.length < 1 || w.steps.length > 60) throw Error("The draft needs a name and 1–60 steps.");
  const notices: string[] = [];
  for (const s of w.steps) {
    if (!builderKinds.includes(s.kind as any) || !s.id.trim() || !s.name.trim()) throw Error("The draft contains an unsupported or unnamed step.");
    if (s.files?.length) throw Error("Generated uploads cannot invent file selections. Generate again with empty uploads.");
    if (s.capability) throw Error("Generated drafts cannot bind unverified capabilities.");
    if (s.kind === "upload") notices.push(`${s.name}: select the files before running.`);
    if (s.kind === "extract") notices.push(`${s.name}: verify selectors against the actual page HTML.`);
    if (/TODO|example\.invalid/i.test(JSON.stringify(s))) notices.push(`${s.name}: fill in the TODO inputs.`);
  }
  validateRoutes(w);
  const edges = routes(w);
  function reachable(start: string, reverse = false) {
    const found = new Set([start]), pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      for (const e of edges) if ((reverse ? e.target : e.source) === id) {
        const to = reverse ? e.source : e.target;
        if (!found.has(to)) { found.add(to); pending.push(to); }
      }
    }
    return found;
  }
  const fromStart = reachable("$start"), toEnd = reachable("$end", true);
  if (w.steps.some(s => !fromStart.has(s.id) || !toEnd.has(s.id))) throw Error("Every generated step must be reachable from Beginning and have a path to End.");
  try { buildRunPlan(w); } catch (e) { notices.push(`Before running: ${String(e).replace(/^Error: /, "")}`); }
  return { workflow: w, notices: [...new Set(notices)] };
}
