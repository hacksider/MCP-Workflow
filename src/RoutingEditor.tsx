import type { Step } from "./workflow";
export function RoutingEditor({
  step,
  steps,
  onChange,
}: {
  step: Step;
  steps: Step[];
  onChange: (patch: Partial<Step>) => void;
}) {
  const destination = (
    label: string,
    value: string,
    change: (value: string) => void,
  ) => (
    <label>
      {label}
      <select value={value} onChange={(e) => change(e.target.value)}>
        <option value="">Next in list</option>
        <option value="$end">End workflow</option>
        {steps.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="routing-editor">
      {step.kind === "condition" && step.condition && (
        <>
          <label>
            Value or reference
            <input
              placeholder="{{steps.extract.outputs.nextUrl}}"
              value={step.condition.left}
              onChange={(e) =>
                onChange({
                  condition: { ...step.condition!, left: e.target.value },
                })
              }
            />
          </label>
          <label>
            Check
            <select
              value={step.condition.operator}
              onChange={(e) =>
                onChange({
                  condition: {
                    ...step.condition!,
                    operator: e.target.value as any,
                  },
                })
              }
            >
              {["truthy", "equals", "contains", "greater"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {step.condition.operator !== "truthy" && (
            <label>
              Compare with
              <input
                value={step.condition.right}
                onChange={(e) =>
                  onChange({
                    condition: { ...step.condition!, right: e.target.value },
                  })
                }
              />
            </label>
          )}
          {destination("If true", step.condition.yes, (v) =>
            onChange({ condition: { ...step.condition!, yes: v } }),
          )}
          {destination("If false", step.condition.no, (v) =>
            onChange({ condition: { ...step.condition!, no: v } }),
          )}
        </>
      )}
      {step.kind === "loop" && step.loop && (
        <>
          <label>
            Number of loops
            <input
              type="number"
              min={1}
              max={1000}
              value={step.loop.times}
              onChange={(e) =>
                onChange({
                  loop: { ...step.loop!, times: Number(e.target.value) },
                })
              }
            />
          </label>
          {destination("Loop body starts at", step.loop.body, (v) =>
            onChange({ loop: { ...step.loop!, body: v } }),
          )}
          {destination("After the loop", step.loop.after, (v) =>
            onChange({ loop: { ...step.loop!, after: v } }),
          )}
          <p className="muted">
            Set the last body step’s Next step to this Loop. Each iteration
            finishes before the next begins.
          </p>
        </>
      )}
      {step.kind === "counter" && step.counter && (
        <>
          <label>
            Repetition limit
            <input
              type="number"
              min={1}
              max={1000000}
              value={step.counter.limit}
              onChange={(e) =>
                onChange({
                  counter: { ...step.counter!, limit: Number(e.target.value) },
                })
              }
            />
          </label>
          {destination("Below limit", step.counter.below, (v) =>
            onChange({ counter: { ...step.counter!, below: v } }),
          )}
          {destination("Limit reached", step.counter.after, (v) =>
            onChange({ counter: { ...step.counter!, after: v } }),
          )}
          <p className="muted">
            Counts one completed visit at a time, starting at 1. Put this after
            the action you want to count; connect Below limit back to that
            action. Counts reset for each run.
          </p>
        </>
      )}
      {!["condition", "loop", "counter"].includes(step.kind) &&
        destination("Next step", step.next ?? "", (v) => onChange({ next: v }))}
      <small>
        References use step IDs: {"{{steps.STEP_ID.outputs.field}}"}. This
        step’s ID: {step.id}
      </small>
    </div>
  );
}
