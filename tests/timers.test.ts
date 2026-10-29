import { afterEach, describe, it, expect, vi } from "vitest";
import { formatCountdown, delayUnits } from "../src/timers";
import { newStep, newWorkflow, parseWorkflow } from "../src/workflow";
import { newContext, runGraph } from "../src/routing";
import { executeNativeStep } from "../src/native";
import { monitoredAttempt } from "../src/attempts";
import demo from "../examples/counter-and-delay.json";
afterEach(() => vi.useRealTimers());
describe("delay and counter steps", () => {
  it("formats a real remaining duration in seconds, hours and days", () => {
    expect(formatCountdown(59001)).toBe("01:00");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-100)).toBe("00:00");
    expect(formatCountdown(3661000)).toBe("01:01:01");
    expect(formatCountdown(90061000)).toBe("1d 01:01:01");
    expect(delayUnits).toEqual({
      seconds: 1,
      minutes: 60,
      hours: 3600,
      days: 86400,
    });
  });
  it("waits the configured duration before proceeding, while reporting activity", async () => {
    vi.useFakeTimers();
    let finished = false;
    const heartbeat = vi.fn();
    const promise = executeNativeStep(
      { ...newStep("wait"), wait: { seconds: 60, unit: "minutes" } },
      newContext(),
      "",
      () => false,
      heartbeat,
    ).then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(59999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await promise;
    expect(finished).toBe(true);
    expect(heartbeat).toHaveBeenCalled();
  });
  it("does not mistake a progressing intentional delay for an unresponsive step", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const p = monitoredAttempt(
      1,
      { retries: 0, delaySeconds: 0, idleSeconds: 0.2 },
      (control) => {
        control.signal.addEventListener("abort", () => (aborted = true));
        return executeNativeStep(
          { ...newStep("wait"), wait: { seconds: 0.6 } },
          newContext(),
          "",
          () => control.signal.aborted,
          control.heartbeat,
        );
      },
      () => false,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(800);
    await p;
    expect(aborted).toBe(false);
  });
  it("increments 1, 2, 3 after completed delays and takes the reached path, fresh on every run", async () => {
    const w = parseWorkflow(JSON.stringify(demo));
    w.cwd = "C:/work";
    w.steps[0].wait!.seconds = 0;
    for (let run = 0; run < 2; run++) {
      const ctx = newContext(),
        counts: number[] = [];
      let waits = 0;
      await runGraph(
        w,
        ctx,
        async (p) => {
          if (p.step.kind === "wait") waits++;
          const r = await executeNativeStep(p.step, ctx, w.cwd);
          const outputs = JSON.parse(r.outputs);
          ctx.steps[p.step.id] = { summary: r.summary, outputs };
          if (p.step.kind === "counter") counts.push(outputs.count);
        },
        () => false,
      );
      expect(counts).toEqual([1, 2, 3]);
      expect(waits).toBe(3);
      expect(ctx.steps.count.outputs.reached).toBe(true);
    }
  });
  it("rejects unsupported units and invalid counter limits before running", () => {
    const w = { ...newWorkflow(), cwd: "C:/work", steps: [newStep("counter")] };
    w.steps[0].counter!.limit = 0;
    expect(() => parseWorkflow(JSON.stringify(w))).toThrow("Counter");
    expect(() =>
      parseWorkflow(
        JSON.stringify({
          ...w,
          steps: [{ ...newStep("wait"), wait: { seconds: 1, unit: "weeks" } }],
        }),
      ),
    ).toThrow("Invalid delay unit");
  });
});
