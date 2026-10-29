import type { Workflow } from "./workflow";
export type Port = "next" | "yes" | "no" | "body" | "after" | "error" | "start";
export type Route = {
  source: string;
  port: Port;
  target: string;
  label: string;
};
export function routes(workflow: Workflow): Route[] {
  const result: Route[] = [
    {
      source: "$start",
      port: "start",
      target: workflow.startStepId ?? workflow.steps[0]?.id ?? "$end",
      label: "Begin",
    },
  ];
  workflow.steps.forEach((s, i) => {
    const next = workflow.steps[i + 1]?.id ?? "$end";
    if (s.kind === "condition")
      result.push(
        {
          source: s.id,
          port: "yes",
          target: s.condition?.yes || next,
          label: "True",
        },
        {
          source: s.id,
          port: "no",
          target: s.condition?.no || next,
          label: "False",
        },
      );
    else if (s.kind === "loop")
      result.push(
        {
          source: s.id,
          port: "body",
          target: s.loop?.body || "$end",
          label: "Repeat",
        },
        {
          source: s.id,
          port: "after",
          target: s.loop?.after || next,
          label: "Done",
        },
      );
    else
      result.push({
        source: s.id,
        port: "next",
        target: s.next || next,
        label: "Next",
      });
    if (s.onError)
      result.push({
        source: s.id,
        port: "error",
        target: s.onError,
        label: "On error",
      });
  });
  return result;
}
export function connectRoute(
  workflow: Workflow,
  source: string,
  port: Port,
  target: string,
): Workflow {
  if (target !== "$end" && !workflow.steps.some((s) => s.id === target))
    throw Error("Choose a valid destination");
  if (source === "$start") return { ...workflow, startStepId: target };
  const step = workflow.steps.find((s) => s.id === source);
  if (!step) throw Error("Choose a source step");
  return {
    ...workflow,
    steps: workflow.steps.map((s) => {
      if (s.id !== source) return s;
      if (port === "error") return { ...s, onError: target };
      if (
        s.kind === "condition" &&
        s.condition &&
        (port === "yes" || port === "no")
      )
        return { ...s, condition: { ...s.condition, [port]: target } };
      if (s.kind === "loop" && s.loop && (port === "body" || port === "after"))
        return { ...s, loop: { ...s.loop, [port]: target } };
      if (port === "next" && !["loop", "condition"].includes(s.kind))
        return { ...s, next: target };
      throw Error("This connector does not belong to the source step");
    }),
  };
}
export function removeStep(workflow: Workflow, id: string): Workflow {
  // Removing a node ends its incoming paths; never silently rewire them to an unrelated step.
  const incoming = routes(workflow).filter(
    (r) => r.target === id && r.source !== id,
  );
  const next = {
    ...workflow,
    startStepId: workflow.startStepId === id ? "$end" : workflow.startStepId,
    steps: workflow.steps.filter((s) => s.id !== id),
  };
  for (const route of incoming)
    if (route.target === id)
      Object.assign(next, connectRoute(next, route.source, route.port, "$end"));
  return next;
}
