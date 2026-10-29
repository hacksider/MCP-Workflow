import { describe, expect, it } from "vitest";
import { newStep, newWorkflow, buildRunPlan } from "../src/workflow";
import { needsAgent } from "../src/native";
describe("direct CRUD flows", () => {
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
