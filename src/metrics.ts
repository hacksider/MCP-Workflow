export type StepTiming = {
  attempts: number;
  completed: number;
  completedMs: number;
};
export type WorkflowMetrics = {
  runs: number;
  completed: number;
  elapsedMs: number;
  steps: Record<string, StepTiming>;
};
export const emptyMetrics = (): WorkflowMetrics => ({
  runs: 0,
  completed: 0,
  elapsedMs: 0,
  steps: {},
});
export function finishMetrics(
  previous: WorkflowMetrics,
  durationMs: number,
  success: boolean,
  steps: { stepId: string; status: string; durationMs?: number }[],
): WorkflowMetrics {
  const next = structuredClone(previous);
  next.completed += success ? 1 : 0;
  next.elapsedMs += Math.max(0, durationMs);
  for (const step of steps) {
    const timing = next.steps[step.stepId] ?? {
      attempts: 0,
      completed: 0,
      completedMs: 0,
    };
    timing.attempts++;
    if (step.status === "completed") {
      timing.completed++;
      timing.completedMs += Math.max(0, step.durationMs ?? 0);
    }
    next.steps[step.stepId] = timing;
  }
  return next;
}
export function formatDuration(ms: number): string {
  if (ms > 0 && ms < 1000) return ms < 1 ? "<1 ms" : `${Math.round(ms)} ms`;
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export const averageDuration = (timing?: StepTiming) =>
  timing?.completed
    ? formatDuration(timing.completedMs / timing.completed)
    : "—";
