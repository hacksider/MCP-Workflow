import { describe, expect, it, vi } from "vitest";
import { newStep, newWorkflow, buildRunPlan } from "../src/workflow";
import { needsAgent, executeNativeStep } from "../src/native";
import { newContext } from "../src/routing";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => ({ status: 200, body: { ok: true } })),
}));
describe("direct CRUD flows", () => {
  it("passes typed form results and headers into a native API call", async () => {
    const ctx = newContext();
    ctx.vars.headers = { "x-demo": "value" };
    ctx.steps.form = {
      summary: "Filled",
      outputs: { name: "Test", quantity: 2 },
    };
    const step = { ...newStep("api"), endpoint: "https://example.com/items" };
    step.api!.headers = "{{vars.headers}}";
    step.api!.body = "{{steps.form.outputs}}";
    step.api!.method = "POST";
    expect(
      buildRunPlan({ ...newWorkflow(), cwd: "C:/work", steps: [step] }),
    ).toHaveLength(1);
    await executeNativeStep(step, ctx);
    expect(invoke).toHaveBeenCalledWith(
      "http_request",
      expect.objectContaining({
        headers: { "x-demo": "value" },
        body: '{"name":"Test","quantity":2}',
      }),
    );
  });
  it("runs configured requests without an AI account or prompt", () => {
    const w = newWorkflow();
    w.cwd = "F:/workspace";
    w.steps = [newStep("api")];
    w.steps[0].endpoint = "https://example.com/items";
    expect(buildRunPlan(w)).toHaveLength(1);
    expect(needsAgent(w)).toBe(false);
    w.steps[0].api = undefined;
    w.steps[0].instructions = "Read records";
    expect(needsAgent(w)).toBe(true);
  });
  it("rejects malformed header configurations before sending requests", () => {
    const w = newWorkflow();
    w.cwd = "F:/workspace";
    w.steps = [newStep("api")];
    w.steps[0].endpoint = "https://example.com/items";
    for (const headers of ["not JSON", "[]", '{"x":42}']) {
      w.steps[0].api!.headers = headers;
      expect(() => buildRunPlan(w)).toThrow();
    }
  });
});
