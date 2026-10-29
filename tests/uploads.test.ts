import { describe, expect, it } from "vitest";
import {
  buildRunPlan,
  newStep,
  newWorkflow,
  parseWorkflow,
} from "../src/workflow";
describe("reusable uploaded files", () => {
  it("requires selected files and carries references into a repeatable run snapshot", () => {
    const w = newWorkflow();
    w.cwd = "F:/workspace";
    w.steps = [newStep("upload")];
    expect(() => buildRunPlan(w)).toThrow("Choose files");
    w.steps[0].files = [
      {
        name: "brief.txt",
        path: "F:/workspace/.mcp-workflow/brief.txt",
        size: 12,
      },
    ];
    const plan = buildRunPlan(parseWorkflow(JSON.stringify(w)));
    expect(plan[0].prompt).toContain("brief.txt");
    expect(plan[0].prompt).toContain("untrusted file contents");
    w.steps[0].files = [];
    expect(plan[0].step.files).toHaveLength(1);
  });
  it("rejects malformed imported file references", () => {
    const w = newWorkflow();
    w.steps = [newStep("upload")];
    w.steps[0].files = [{ name: "x", path: "x", size: -1 }];
    expect(() => parseWorkflow(JSON.stringify(w))).toThrow("file references");
  });
});
