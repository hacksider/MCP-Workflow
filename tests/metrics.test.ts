import { describe, expect, it } from "vitest";
import {
  averageDuration,
  emptyMetrics,
  finishMetrics,
  formatDuration,
} from "../src/metrics";
describe("run timing statistics", () => {
  it("counts repeated steps and averages successful completions across reruns", () => {
    const started = { ...emptyMetrics(), runs: 1 };
    const first = finishMetrics(started, 10000, true, [
      { stepId: "a", status: "completed", durationMs: 2000 },
      { stepId: "a", status: "completed", durationMs: 4000 },
      { stepId: "b", status: "completed", durationMs: 3000 },
    ]);
    const second = finishMetrics({ ...first, runs: 2 }, 5000, false, [
      { stepId: "a", status: "failed", durationMs: 5000 },
    ]);
    expect(second.runs).toBe(2);
    expect(second.completed).toBe(1);
    expect(second.elapsedMs).toBe(15000);
    expect(second.steps.a).toEqual({
      attempts: 3,
      completed: 2,
      completedMs: 6000,
    });
    expect(averageDuration(second.steps.a)).toBe("00:03");
    expect(averageDuration()).toBe("—");
    expect(started.steps).toEqual({});
  });
  it("shows unbounded minutes and clamps negative timing values", () => {
    expect(formatDuration(3723000)).toBe("62:03");
    expect(formatDuration(-1)).toBe("00:00");
  });
});
