import { afterEach, describe, it, expect, vi } from "vitest";
import { runGraph, newContext } from "../src/routing";
import loopExample from "../examples/conditions-and-loops.json";
import { executeNativeStep } from "../src/native";
import { newStep, newWorkflow, parseWorkflow } from "../src/workflow";
import {
  BlockedStepError,
  UnsafeStepError,
  monitoredAttempt,
} from "../src/attempts";
import { connectRoute, routes, removeStep } from "../src/graph";
afterEach(() => vi.useRealTimers());
const flow = (steps: ReturnType<typeof newStep>[]) => ({
  ...newWorkflow(),
  cwd: "C:/work",
  steps,
});
describe("recovery and visual routes", () => {
  it("executes the bundled recovery, condition and loop example to completion", async () => {
    const w = parseWorkflow(JSON.stringify(loopExample));
    w.cwd = "C:/work";
    for (const s of w.steps) {
      if (s.retry) s.retry.delaySeconds = 0;
      if (s.wait) s.wait.seconds = 0;
    }
    const ctx = newContext();
    const seen: string[] = [];
    await runGraph(
      w,
      ctx,
      async (p) => {
        seen.push(p.step.id);
        const report = await executeNativeStep(p.step, ctx, w.cwd);
        ctx.steps[p.step.id] = {
          summary: report.summary,
          outputs: JSON.parse(report.outputs),
        };
      },
      () => false,
    );
    expect(seen.filter((id) => id === "optional")).toHaveLength(2);
    expect(seen.filter((id) => id === "body")).toHaveLength(3);
    expect(ctx.vars.recovered).toBe(true);
    expect(ctx.vars.result).toContain("Finished");
    expect(seen).toHaveLength(12);
  });

  it("never retries or redirects when agent work has not safely finished", async () => {
    let calls = 0;
    const s = {
      ...newStep("wait"),
      retry: { retries: 2, delaySeconds: 0, idleSeconds: 0 },
      onError: "end",
    };
    await expect(
      runGraph(
        flow([s, { ...newStep("wait"), id: "end" }]),
        newContext(),
        async () => {
          calls++;
          throw new UnsafeStepError("Still running");
        },
        () => false,
      ),
    ).rejects.toThrow("Still running");
    expect(calls).toBe(1);
  });

  it("always supplies Beginning and End and reconnects explicit branches", () => {
    expect(routes(flow([]))).toEqual([
      { source: "$start", port: "start", target: "$end", label: "Begin" },
    ]);
    const a = { ...newStep("condition"), id: "a" },
      b = { ...newStep("wait"), id: "b" };
    let w = connectRoute(flow([a, b]), "a", "yes", "b");
    w = connectRoute(w, "a", "no", "$end");
    w = connectRoute(w, "$start", "start", "b");
    expect(w.startStepId).toBe("b");
    expect(w.steps[0].condition).toMatchObject({ yes: "b", no: "$end" });
    expect(() => connectRoute(w, "a", "yes", "missing")).toThrow();
  });
  it("ends incoming paths when a connected step is deleted", () => {
    const a = { ...newStep("wait"), id: "a" },
      b = { ...newStep("wait"), id: "b" },
      c = { ...newStep("wait"), id: "c" };
    const w = removeStep(flow([a, b, c]), "b");
    expect(w.steps[0].next).toBe("$end");
    expect(removeStep(flow([a, b]), "a").startStepId).toBe("$end");
  });
  it("rolls back failed attempt data and retries before proceeding", async () => {
    const s = {
      ...newStep("wait"),
      id: "a",
      retry: { retries: 1, delaySeconds: 0, idleSeconds: 0 },
    };
    const ctx = newContext(),
      seen: number[] = [];
    await runGraph(
      flow([s]),
      ctx,
      async (_, c, control) => {
        seen.push(control.attempt);
        if (control.attempt === 1) {
          c.vars.partial = "failed";
          c.datasets.items = [{ id: 1 }];
          throw Error("transient");
        }
        expect(c.vars.partial).toBeUndefined();
        expect(c.datasets.items).toBeUndefined();
        c.vars.done = true;
      },
      () => false,
    );
    expect(seen).toEqual([1, 2]);
    expect(ctx.vars.done).toBe(true);
  });
  it("interrupts idle work, waits for it to end, then retries without overlap", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const s = {
      ...newStep("wait"),
      id: "a",
      retry: { retries: 1, delaySeconds: 0, idleSeconds: 0.1 },
      onError: "end",
    };
    const p = runGraph(
      flow([s, { ...newStep("wait"), id: "end" }]),
      newContext(),
      async (e, _, control) => {
        if (e.step.id === "end") {
          order.push("end");
          return;
        }
        order.push(`start${control.attempt}`);
        await new Promise<void>((resolve) =>
          control.signal.addEventListener(
            "abort",
            () => {
              order.push(`abort${control.attempt}`);
              setTimeout(() => {
                order.push(`stopped${control.attempt}`);
                resolve();
              }, 50);
            },
            { once: true },
          ),
        );
      },
      () => false,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(order).toEqual([
      "start1",
      "abort1",
      "stopped1",
      "start2",
      "abort2",
      "stopped2",
      "end",
    ]);
  });
  it("pauses inactivity while awaiting a human and resumes the timer afterward", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const p = monitoredAttempt(
      1,
      { retries: 0, delaySeconds: 0, idleSeconds: 0.1 },
      async (control) => {
        control.pause(true);
        control.signal.addEventListener("abort", () => (aborted = true));
        await new Promise((r) => setTimeout(r, 600));
        control.pause(false);
        await new Promise((r) => setTimeout(r, 40));
        return "done";
      },
      () => false,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(800);
    expect(await p).toBe("done");
    expect(aborted).toBe(false);
  });
  it("routes failed conditions without evaluating them again and skips retries for blockers", async () => {
    const step = {
      ...newStep("condition"),
      id: "a",
      condition: {
        left: "{{vars.missing}}",
        operator: "truthy" as const,
        right: "",
        yes: "$end",
        no: "$end",
      },
      onError: "recovery",
      retry: { retries: 3, delaySeconds: 0, idleSeconds: 0 },
    };
    const seen: string[] = [];
    await runGraph(
      flow([step, { ...newStep("wait"), id: "recovery" }]),
      newContext(),
      async (p) => {
        seen.push(p.step.id);
        if (p.step.id === "a") throw new BlockedStepError("Needs input");
      },
      () => false,
    );
    expect(seen).toEqual(["a", "recovery"]);
  });
  it("counts retries against the global execution cap", async () => {
    const s = {
      ...newStep("wait"),
      retry: { retries: 10, delaySeconds: 0, idleSeconds: 0 },
    };
    await expect(
      runGraph(
        { ...flow([s]), maxExecutions: 2 },
        newContext(),
        async () => {
          throw Error("failed");
        },
        () => false,
      ),
    ).rejects.toThrow("Execution limit");
  });
  it("honors the configured beginning instead of assuming the first node", async () => {
    const w = flow([
      { ...newStep("wait"), id: "skip" },
      { ...newStep("wait"), id: "start" },
    ]);
    const seen: string[] = [];
    await runGraph(
      { ...w, startStepId: "start" },
      newContext(),
      async (p) => {
        seen.push(p.step.id);
      },
      () => false,
    );
    expect(seen).toEqual(["start"]);
  });
  it("stops cancellation without retrying or following an error path", async () => {
    let cancelled = false;
    const seen: string[] = [];
    const w = flow([
      {
        ...newStep("wait"),
        id: "a",
        retry: { retries: 2, delaySeconds: 0, idleSeconds: 0 },
        onError: "end",
      },
      { ...newStep("wait"), id: "end" },
    ]);
    await runGraph(
      w,
      newContext(),
      async (p) => {
        seen.push(p.step.id);
        cancelled = true;
        throw Error("stopped");
      },
      () => cancelled,
    );
    expect(seen).toEqual(["a"]);
  });
});
