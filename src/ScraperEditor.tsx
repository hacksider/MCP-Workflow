import { delayUnits, maxDelaySeconds, type DelayUnit } from "./timers";
import type { Step } from "./workflow";
export function ScraperEditor({
  step,
  steps,
  onChange,
}: {
  step: Step;
  steps: Step[];
  onChange: (patch: Partial<Step>) => void;
}) {
  const input = (
    label: string,
    value: string,
    change: (s: string) => void,
    help?: string,
  ) => (
    <label>
      {label}
      <input value={value} onChange={(e) => change(e.target.value)} />
      {help && <small>{help}</small>}
    </label>
  );
  const source = (
    kind: "fetch" | "extract",
    value: string,
    change: (s: string) => void,
    suffix = "",
  ) => (
    <label>
      Source step
      <select value={value} onChange={(e) => change(e.target.value)}>
        <option value="">Choose a {kind} step</option>
        {steps
          .filter((s) => s.kind === kind)
          .map((s) => (
            <option key={s.id} value={`{{steps.${s.id}.outputs${suffix}}}`}>
              {s.name}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <div className="scraper-editor">
      {step.kind === "values" && (
        <label>
          Values (JSON)
          <textarea
            rows={7}
            value={step.values ?? "{}"}
            onChange={(e) => onChange({ values: e.target.value })}
          />
          <small>
            Set named inputs. Reference them as {"{{vars.url}}"}. Later Set
            values steps can update them.
          </small>
        </label>
      )}
      {step.fetch && (
        <>
          {input(
            "Page URL or reference",
            step.fetch.url,
            (v) => onChange({ fetch: { ...step.fetch!, url: v } }),
            "HTTP(S) HTML pages. The demo uses fixture://amazon-demo/page-1.",
          )}
          <label>
            Maximum pages
            <input
              type="number"
              min={1}
              max={1000}
              value={step.fetch.maxPages}
              onChange={(e) =>
                onChange({
                  fetch: { ...step.fetch!, maxPages: Number(e.target.value) },
                })
              }
            />
          </label>
          <small>
            Checks robots.txt, bounds response size, retries transient HTTP
            errors up to twice, and stops on access blocks. Does not render
            JavaScript; use Computer task for browser interactions.
          </small>
        </>
      )}
      {step.extract && (
        <>
          {source("fetch", step.extract.source, (v) =>
            onChange({ extract: { ...step.extract!, source: v } }),
          )}
          {input("Row CSS selector", step.extract.rowSelector, (v) =>
            onChange({ extract: { ...step.extract!, rowSelector: v } }),
          )}
          <h3>Fields to extract</h3>
          {step.extract.fields.map((f, i) => (
            <div className="extract-field" key={i}>
              {input("Column name", f.name, (v) =>
                onChange({
                  extract: {
                    ...step.extract!,
                    fields: step.extract!.fields.map((x, j) =>
                      j === i ? { ...x, name: v } : x,
                    ),
                  },
                }),
              )}
              {input(
                "CSS selector within row",
                f.selector,
                (v) =>
                  onChange({
                    extract: {
                      ...step.extract!,
                      fields: step.extract!.fields.map((x, j) =>
                        j === i ? { ...x, selector: v } : x,
                      ),
                    },
                  }),
                "Leave empty to use the row itself.",
              )}
              {input("Attribute (empty = text)", f.attribute, (v) =>
                onChange({
                  extract: {
                    ...step.extract!,
                    fields: step.extract!.fields.map((x, j) =>
                      j === i ? { ...x, attribute: v } : x,
                    ),
                  },
                }),
              )}
              <label>
                <input
                  type="checkbox"
                  checked={!!f.required}
                  onChange={(e) =>
                    onChange({
                      extract: {
                        ...step.extract!,
                        fields: step.extract!.fields.map((x, j) =>
                          j === i ? { ...x, required: e.target.checked } : x,
                        ),
                      },
                    })
                  }
                />{" "}
                Required
              </label>
              <button
                onClick={() =>
                  onChange({
                    extract: {
                      ...step.extract!,
                      fields: step.extract!.fields.filter((_, j) => j !== i),
                    },
                  })
                }
              >
                Remove field
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              onChange({
                extract: {
                  ...step.extract!,
                  fields: [
                    ...step.extract!.fields,
                    { name: "field", selector: "", attribute: "" },
                  ],
                },
              })
            }
          >
            Add column
          </button>
          {input(
            "Next-page link CSS selector",
            step.extract.nextSelector,
            (v) => onChange({ extract: { ...step.extract!, nextSelector: v } }),
            "Reads href. An absent next link ends pagination.",
          )}
        </>
      )}
      {step.collect && (
        <>
          {source(
            "extract",
            step.collect.source,
            (v) => onChange({ collect: { ...step.collect!, source: v } }),
            ".rows",
          )}
          {input("Dataset name", step.collect.dataset, (v) =>
            onChange({ collect: { ...step.collect!, dataset: v } }),
          )}
          {input(
            "Unique column",
            step.collect.uniqueKey,
            (v) => onChange({ collect: { ...step.collect!, uniqueKey: v } }),
            "Duplicates are ignored. Empty compares entire rows.",
          )}
          {input(
            "Live CSV filename prefix (optional)",
            step.collect.liveCsvName ?? "",
            (v) => onChange({ collect: { ...step.collect!, liveCsvName: v } }),
            "Writes and appends actual CSV rows after each collection. Leave empty to export only at the end.",
          )}
        </>
      )}
      {step.wait && (
        <>
          <label>
            Delay amount
            <input
              type="number"
              min={0}
              max={maxDelaySeconds / delayUnits[step.wait.unit ?? "seconds"]}
              step="any"
              value={
                step.wait.seconds / delayUnits[step.wait.unit ?? "seconds"]
              }
              onChange={(e) =>
                onChange({
                  wait: {
                    ...step.wait!,
                    seconds:
                      Number(e.target.value) *
                      delayUnits[step.wait!.unit ?? "seconds"],
                  },
                })
              }
            />
          </label>
          <label>
            Time unit
            <select
              value={step.wait.unit ?? "seconds"}
              onChange={(e) => {
                const unit = e.target.value as DelayUnit;
                const amount =
                  step.wait!.seconds / delayUnits[step.wait!.unit ?? "seconds"];
                onChange({
                  wait: { seconds: amount * delayUnits[unit], unit },
                });
              }}
            >
              {Object.keys(delayUnits).map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <small>
            The next step waits for this countdown to reach zero. Delays can
            last up to 365 days while this app remains running. Stop interrupts
            the delay; it does not survive an app restart.
          </small>
        </>
      )}
      {step.export && (
        <>
          {input("Dataset name", step.export.dataset, (v) =>
            onChange({ export: { ...step.export!, dataset: v } }),
          )}
          {input(
            "Output filename prefix",
            step.export.name,
            (v) => onChange({ export: { ...step.export!, name: v } }),
            "Saved in the workspace with a unique timestamp. Existing files are preserved.",
          )}
          <label>
            File type
            <select
              value={step.export.format}
              onChange={(e) =>
                onChange({
                  export: {
                    ...step.export!,
                    format: e.target.value as "csv" | "json",
                  },
                })
              }
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}
