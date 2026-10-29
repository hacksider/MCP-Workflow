import { describe, it, expect } from "vitest";
import { newStep, newWorkflow } from "../src/workflow";
import { runGraph, newContext, resolve } from "../src/routing";
describe("workflow graph", () => {
  it("awaits each body and exits a counted loop", async () => {
    const gate = {
      ...newStep("loop"),
      id: "gate",
      loop: { times: 3, body: "body", after: "end" },
    };
    const body = {
      ...newStep("instruction"),
      id: "body",
      instructions: "work",
      next: "gate",
    };
    const end = { ...newStep("instruction"), id: "end", instructions: "done" };
    const seen: string[] = [];
    await runGraph(
      { ...newWorkflow(), cwd: "C:/work", steps: [gate, body, end] },
      newContext(),
      async (p) => {
        await Promise.resolve();
        seen.push(p.step.id);
      },
      () => false,
    );
    expect(seen).toEqual([
      "gate",
      "body",
      "gate",
      "body",
      "gate",
      "body",
      "gate",
      "end",
    ]);
  });
  it("routes false and stops on failure before later work", async () => {
    const c = {
      ...newStep("condition"),
      condition: {
        left: "{{vars.go}}",
        operator: "truthy" as const,
        right: "",
        yes: "skip",
        no: "done",
      },
    };
    const w = {
      ...newWorkflow(),
      cwd: "C:/work",
      steps: [
        c,
        { ...newStep("instruction"), id: "skip", instructions: "skip" },
        { ...newStep("instruction"), id: "done", instructions: "done" },
      ],
    };
    const ctx = newContext();
    ctx.vars.go = false;
    const seen: string[] = [];
    await runGraph(
      w,
      ctx,
      async (p) => {
        seen.push(p.step.id);
      },
      () => false,
    );
    expect(seen).toEqual([c.id, "done"]);
    await expect(
      runGraph(
        w,
        ctx,
        async () => {
          throw Error("blocked");
        },
        () => false,
      ),
    ).rejects.toThrow("blocked");
  });
  it("caps cyclic execution and rejects missing destinations", async () => {
    const s = {
      ...newStep("instruction"),
      id: "a",
      instructions: "work",
      next: "a",
    };
    await expect(
      runGraph(
        { ...newWorkflow(), cwd: "C:/work", maxExecutions: 3, steps: [s] },
        newContext(),
        async () => {},
        () => false,
      ),
    ).rejects.toThrow("Execution limit");
    await expect(
      runGraph(
        { ...newWorkflow(), cwd: "C:/work", steps: [{ ...s, next: "absent" }] },
        newContext(),
        async () => {},
        () => false,
      ),
    ).rejects.toThrow("Missing destination");
  });
  it("resolves typed references without executing code or traversing prototypes", () => {
    const ctx = newContext();
    ctx.vars.rows = [{ n: 2 }];
    expect(resolve("{{vars.rows}}", ctx)).toEqual([{ n: 2 }]);
    expect(resolve("n={{vars.rows.0.n}}", ctx)).toBe("n=2");
    expect(() => resolve("{{vars.constructor}}", ctx)).toThrow();
    expect(() => resolve("{{vars.missing}}", ctx)).toThrow();
  });
});
