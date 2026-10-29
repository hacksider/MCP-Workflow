import type { FormField } from "./workflow";
export function FormEditor({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const edit = (i: number, patch: Partial<FormField>) =>
    onChange(fields.map((f, n) => (n === i ? { ...f, ...patch } : f)));
  return (
    <div className="form-editor">
      <h3>Form fields</h3>
      {fields.map((f, i) => (
        <div className="form-field" key={f.id}>
          <label>
            Field label
            <input
              value={f.label}
              onChange={(e) => edit(i, { label: e.target.value })}
            />
          </label>
          <label>
            Answer type
            <select
              value={f.type}
              onChange={(e) =>
                edit(i, { type: e.target.value as FormField["type"] })
              }
            >
              {[
                "text",
                "textarea",
                "number",
                "checkbox",
                "email",
                "date",
                "select",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field-required">
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => edit(i, { required: e.target.checked })}
            />{" "}
            Required answer
          </label>
          {f.type === "select" && (
            <label>
              Choices (one per line)
              <textarea
                rows={3}
                value={(f.options ?? []).join("\n")}
                onChange={(e) =>
                  edit(i, {
                    options: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            </label>
          )}
          <label>
            Hint for the AI
            <input
              value={f.hint ?? ""}
              onChange={(e) => edit(i, { hint: e.target.value })}
            />
          </label>
          <button
            className="danger"
            onClick={() => onChange(fields.filter((_, n) => n !== i))}
          >
            Remove field
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([
            ...fields,
            {
              id: `field_${crypto.randomUUID().replaceAll("-", "")}`,
              label: "New field",
              type: "text",
              required: true,
            },
          ])
        }
      >
        + Add field
      </button>
    </div>
  );
}
export function FormResult({
  fields,
  values,
}: {
  fields: FormField[];
  values: Record<string, unknown>;
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(values, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "filled-form.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="filled-form">
      {fields.map((f) => (
        <label key={f.id}>
          {f.label}
          {f.type === "checkbox" ? (
            <input
              className="form-checkbox"
              type="checkbox"
              checked={values[f.id] === true}
              readOnly
            />
          ) : (
            <input
              readOnly
              value={values[f.id] === null ? "" : String(values[f.id] ?? "")}
            />
          )}
        </label>
      ))}
      <button onClick={download}>Download filled JSON</button>
    </div>
  );
}
