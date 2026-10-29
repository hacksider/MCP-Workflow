import { describe, expect, it } from "vitest";
import {
  buildRunPlan,
  CompletionGuard,
  newStep,
  newWorkflow,
  parseWorkflow,
  runSequential,
} from "../src/workflow";

const report = JSON.stringify({
  status: "completed",
  summary: "Finished",
  outputs: "Verified result",
});
const completed = { status: "completed" };
function workflow() {
  const w = newWorkflow();
  w.cwd = "F:/workspace";
  w.steps = [newStep("instruction"), newStep("api")];
  w.steps[0].instructions = "Write a brief";
  w.steps[0].repeat = 2;
  w.steps[1].instructions = "Read recent records";
  w.steps[1].endpoint = "https://example.com/api";
  return w;
}
describe("repeatable, sequential execution", () => {
  it("plans repetitions before the next step and snapshots definitions for a fresh replay", async () => {
    const w = workflow();
    const plan = buildRunPlan(w);
    w.steps[0].instructions = "Edited while running";
    expect(plan.map((p) => [p.index, p.iteration])).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
    ]);
    expect(plan[0].prompt).toContain("Write a brief");
    expect(plan[0].prompt).not.toContain("Edited while running");
    const seen: string[] = [];
    for (let run = 0; run < 2; run++)
      await runSequential(
        plan,
        async (p) => {
          seen.push(p.id);
        },
        () => false,
      );
    expect(seen.slice(0, 3)).toEqual(seen.slice(3));
    expect(new Set(plan.map((p) => p.id)).size).toBe(3);
  });
  it("does not start the next step until the first finishes", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const seen: number[] = [];
    const execution = runSequential(
      [1, 2],
      async (value) => {
        seen.push(value);
        if (value === 1) await held;
      },
      () => false,
    );
    await Promise.resolve();
    expect(seen).toEqual([1]);
    release();
    await execution;
    expect(seen).toEqual([1, 2]);
  });
  it.each(["blocked", "failed", "interrupted", "malformed", "unfinished"])(
    "halts before the next step for a %s result",
    async (status) => {
      const seen: number[] = [];
      const guard = new CompletionGuard();
      if (status === "unfinished")
        guard.observe("item/started", { id: "tool", type: "mcpToolCall" });
      const execution = runSequential(
        [1, 2],
        async (value) => {
          seen.push(value);
          guard.finish(
            { status: status === "interrupted" ? "interrupted" : "completed" },
            status === "malformed"
              ? "invalid"
              : status === "blocked" || status === "failed"
                ? JSON.stringify({
                    status,
                    summary: "Cannot finish",
                    outputs: "",
                  })
                : report,
          );
        },
        () => false,
      );
      await expect(execution).rejects.toThrow();
      expect(seen).toEqual([1]);
    },
  );
  it("requires delegated agents to finish, including agents that finish after the parent response", () => {
    const guard = new CompletionGuard();
    guard.observe("item/completed", {
      id: "spawn",
      type: "collabAgentToolCall",
      tool: "spawnAgent",
      receiverThreadIds: ["child"],
      agentsStates: { child: { status: "running" } },
    });
    expect(() => guard.finish(completed, report)).toThrow("unfinished");
    guard.observe("item/completed", {
      id: "wait",
      type: "collabAgentToolCall",
      tool: "wait",
      agentsStates: { child: { status: "completed" } },
    });
    expect(guard.finish(completed, report).status).toBe("completed");
  });
  it("halts after cancellation rather than starting a repetition or the next step", async () => {
    let cancelled = false;
    const seen: number[] = [];
    await runSequential(
      [1, 2, 3],
      async (n) => {
        seen.push(n);
        cancelled = true;
      },
      () => cancelled,
    );
    expect(seen).toEqual([1]);
  });
  it("keeps old text steps compatible and rejects invalid repeat counts", () => {
    const w = workflow();
    delete w.steps[0].repeat;
    expect(buildRunPlan(parseWorkflow(JSON.stringify(w)))).toHaveLength(2);
    for (const repeat of [0, 101, 1.5]) {
      w.steps[0].repeat = repeat;
      expect(() => buildRunPlan(w)).toThrow("Repeat count");
    }
  });
});
