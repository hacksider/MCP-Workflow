import { describe, expect, it } from "vitest";
import {
  buildRunPlan,
  newStep,
  newWorkflow,
  parseWorkflow,
} from "../src/workflow";
import {
  bindRuntimeSkills,
  explicitPlugins,
  pluginCatalog,
} from "../src/plugins";
const catalog = pluginCatalog(
  {
    available: [
      {
        pluginId: "computer-use@m",
        name: "computer-use",
        marketplaceName: "m",
        installed: false,
        installPolicy: "AVAILABLE",
      },
    ],
  },
  null,
);
function computerPlan() {
  const w = newWorkflow();
  w.cwd = "F:/workspace";
  w.steps = [newStep("computer")];
  w.steps[0].instructions = "Check a result in Calculator";
  return buildRunPlan(parseWorkflow(JSON.stringify(w)));
}
describe("computer task capability setup", () => {
  it("requires the computer-use package and binds its enabled skill after installation", () => {
    const plan = computerPlan();
    expect(explicitPlugins(plan, catalog)).toEqual(["computer-use@m"]);
    bindRuntimeSkills(
      plan,
      [
        {
          id: "skill:x",
          kind: "skill",
          name: "computer-use:computer-use",
          description: "Control apps",
          path: "/latest/SKILL.md",
          pluginId: "computer-use@m",
          enabled: true,
        },
      ],
      catalog,
    );
    expect(plan[0].step.capability?.path).toBe("/latest/SKILL.md");
  });
  it("blocks when the package or compatible skill is unavailable", () => {
    expect(() => explicitPlugins(computerPlan(), [])).toThrow("not available");
    expect(() => bindRuntimeSkills(computerPlan(), [], catalog)).toThrow(
      "unavailable",
    );
  });
  it("instructs the model to verify UI actions and report a blocker without a runtime", () => {
    const prompt = computerPlan()[0].prompt;
    expect(prompt).toContain("verify the visible outcome");
    expect(prompt).toContain("return blocked");
    expect(prompt).toContain("Do not guess the UI");
  });
});
