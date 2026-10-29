import { buildRunPlan, type Workflow, type PlannedStep } from "./workflow";
export type Context = {
  steps: Record<string, { summary: string; outputs: any }>;
  vars: Record<string, any>;
  datasets: Record<string, any[]>;
};
export const newContext = (): Context => ({
  steps: {},
  vars: {},
  datasets: {},
});
export function valueAt(path: string, context: Context): any {
  let value: any = context;
  for (const key of path.trim().split(".")) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      value == null ||
      !Object.prototype.hasOwnProperty.call(value, key)
    )
      throw new Error(`Missing value: ${path}`);
    value = value[key];
  }
  return value;
}
export function resolve(text: string, context: Context): any {
  const full = text.match(/^\s*{{\s*([^{}]+?)\s*}}\s*$/);
  if (full) return valueAt(full[1], context);
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (_, path) => {
    const v = valueAt(path, context);
    return typeof v === "string" ? v : JSON.stringify(v);
  });
}
export function conditionResult(
  config: NonNullable<Workflow["steps"][number]["condition"]>,
  context: Context,
) {
  const a = resolve(config.left, context),
    b = resolve(config.right, context);
  switch (config.operator) {
    case "truthy":
      return !!a;
    case "equals":
      return JSON.stringify(a) === JSON.stringify(b);
    case "contains":
      return Array.isArray(a) ? a.includes(b) : String(a).includes(String(b));
    case "greater": {
      const x = Number(a),
        y = Number(b);
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error("Greater than needs numbers");
      return x > y;
    }
    default:
      throw new Error("Unknown condition operator");
  }
}
export function validateRoutes(workflow: Workflow) {
  const ids = new Set(workflow.steps.map((s) => s.id));
  if (
    !Number.isInteger(workflow.maxExecutions ?? 100) ||
    (workflow.maxExecutions ?? 100) < 1 ||
    (workflow.maxExecutions ?? 100) > 10000
  )
    throw new Error("Execution limit must be 1–10000");
  for (const s of workflow.steps) {
    const targets = [
      s.next,
      s.condition?.yes,
      s.condition?.no,
      s.loop?.body,
      s.loop?.after,
    ];
    for (const target of targets)
      if (target && target !== "$end" && !ids.has(target))
        throw new Error(`Missing destination in ${s.name}`);
    if (
      s.kind === "condition" &&
      (!s.condition ||
        !["equals", "contains", "truthy", "greater"].includes(
          s.condition.operator,
        ))
    )
      throw new Error("Configure the condition");
    if (
      s.kind === "loop" &&
      (!s.loop ||
        !s.loop.body ||
        !Number.isInteger(s.loop.times) ||
        s.loop.times < 1 ||
        s.loop.times > 1000)
    )
      throw new Error("Loop needs a body and 1–1000 iterations");
  }
}
export async function runGraph(
  workflow: Workflow,
  context: Context,
  execute: (entry: PlannedStep, context: Context) => Promise<void>,
  cancelled: () => boolean,
) {
  const plan = buildRunPlan(workflow);
  validateRoutes(workflow);
  const steps = [...new Map(plan.map((p) => [p.step.id, p.step])).values()];
  const loops = new Map<string, number>();
  let index = 0,
    count = 0;
  while (index < steps.length && !cancelled()) {
    const step = steps[index];
    for (const base of plan.filter((p) => p.step.id === step.id)) {
      if (cancelled()) return;
      if (++count > (workflow.maxExecutions ?? 100))
        throw new Error(
          "Execution limit reached. Check loop exits or raise the workflow limit.",
        );
      await execute({ ...base, id: `${base.id}:visit-${count}` }, context);
    }
    let target = step.next;
    if (step.kind === "condition")
      target = conditionResult(step.condition!, context)
        ? step.condition!.yes
        : step.condition!.no;
    if (step.kind === "loop") {
      const n = loops.get(step.id) ?? 0;
      if (n < step.loop!.times) {
        loops.set(step.id, n + 1);
        target = step.loop!.body;
      } else {
        loops.delete(step.id);
        target = step.loop!.after;
      }
    }
    if (target === "$end") return;
    index = target ? steps.findIndex((s) => s.id === target) : index + 1;
  }
}
