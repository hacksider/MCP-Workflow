import { invoke } from "@tauri-apps/api/core";
import { conditionResult, type Context } from "./routing";
import type { Step, Workflow } from "./workflow";
export const isNativeStep = (step: Step) => (step.kind === "api" && !!step.api) || ["condition", "loop"].includes(step.kind);
export const needsAgent = (workflow: Workflow) =>
  workflow.steps.some((s) => !isNativeStep(s));
export async function executeNativeStep(
  step: Step,
  context: Context,
): Promise<{ status: "completed"; summary: string; outputs: string }> {
  if (step.kind === "condition" || step.kind === "loop") return {status:"completed",summary:step.kind === "condition" ? `Condition: ${conditionResult(step.condition!,context)}` : `Loop gate (${step.loop!.times} iterations)`,outputs:JSON.stringify(step.kind === "condition" ? {matched:conditionResult(step.condition!,context)} : {times:step.loop!.times})};
  if (step.kind === "api" && step.api) {
    const data = await invoke<any>("http_request", {
      url: step.endpoint,
      method: step.api.method,
      headers: JSON.parse(step.api.headers),
      body: step.api.body,
      authEnv: step.api.authEnv,
    });
    if (data.status < 200 || data.status >= 300)
      throw new Error(
        `HTTP ${data.status}: ${JSON.stringify(data.body).slice(0, 4000)}`,
      );
    return {
      status: "completed",
      summary: `${step.api.method} ${step.endpoint} → HTTP ${data.status}`,
      outputs: JSON.stringify(data),
    };
  }
  throw new Error("Unsupported native step");
}
