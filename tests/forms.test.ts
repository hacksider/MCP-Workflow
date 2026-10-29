import { describe, expect, it } from "vitest";
import {
  buildRunPlan,
  newWorkflow,
  newStep,
  validateFormValues,
  type FormField,
} from "../src/workflow";
const fields: FormField[] = [
  { id: "email", label: "Email", type: "email", required: true },
  { id: "count", label: "Count", type: "number", required: true },
  { id: "approved", label: "Approved", type: "checkbox", required: true },
  {
    id: "choice",
    label: "Choice",
    type: "select",
    required: true,
    options: ["A", "B"],
  },
];
describe("AI-filled forms", () => {
  it("validates typed answers, including false and zero", () => {
    expect(
      validateFormValues(
        fields,
        JSON.stringify({
          email: "a@example.com",
          count: 0,
          approved: false,
          choice: "A",
        }),
      ).count,
    ).toBe(0);
  });
  it.each([
    { email: "x", count: 1, approved: false, choice: "A" },
    { email: "a@example.com", count: "1", approved: false, choice: "A" },
    { email: "a@example.com", count: 1, approved: false, choice: "Z" },
    { count: 1, approved: true, choice: "A" },
  ])("rejects invalid or missing answers", (value) => {
    expect(() => validateFormValues(fields, JSON.stringify(value))).toThrow();
  });
  it("allows optional unknown values and builds a runnable form without a custom prompt", () => {
    expect(
      validateFormValues(
        [{ id: "note", label: "Note", type: "text", required: false }],
        "{}",
      ),
    ).toEqual({ note: null });
    const w = newWorkflow();
    w.cwd = "F:/workspace";
    w.steps = [newStep("form")];
    expect(buildRunPlan(w)[0].prompt).toContain("Fill this form");
  });
});
