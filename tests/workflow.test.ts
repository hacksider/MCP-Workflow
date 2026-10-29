import { describe, expect, it } from "vitest";
import {
  newStep,
  newWorkflow,
  normalizeCapabilities,
  parseOutcome,
  parseWorkflow,
  stepPrompt,
} from "../src/workflow";
describe("workflow persistence and execution boundaries", () => {
  it("keeps blocked and failed business outcomes distinct from successful turns", () => {
    for (const status of ["blocked", "failed", "completed"])
      expect(
        parseOutcome(JSON.stringify({ status, summary: "Result", outputs: "" }))
          .status,
      ).toBe(status);
    expect(() => parseOutcome('{"status":"ok"}')).toThrow();
    expect(() => parseOutcome("Not a structured result")).toThrow();
  });
  it("round trips workflow definitions and rejects duplicate steps", () => {
    const w = newWorkflow();
    w.steps = [newStep("instruction")];
    expect(parseWorkflow(JSON.stringify(w))).toEqual(w);
    w.steps.push(w.steps[0]);
    expect(() => parseWorkflow(JSON.stringify(w))).toThrow("duplicate");
  });
  it("rejects invalid imports without accepting executable endpoint schemes", () => {
    expect(() => parseWorkflow('{"schemaVersion":2}')).toThrow();
    const w = newWorkflow(),
      s = newStep("api");
    s.instructions = "Get account details";
    for (const endpoint of [
      "javascript:alert(1)",
      "file:///secret",
      "https://user:password@example.com",
    ]) {
      s.endpoint = endpoint;
      expect(() => stepPrompt(w, s, 0)).toThrow();
    }
  });
  it("includes shared context, instructions and API reference with clear trust boundaries", () => {
    const w = newWorkflow();
    w.instructions = "Return a table";
    const s = newStep("api");
    s.endpoint = "https://example.com/v1";
    s.instructions = "Find recent orders";
    s.documentation = "GET /orders";
    w.steps = [s];
    const prompt = stepPrompt(w, s, 0);
    for (const text of [
      "Return a table",
      "Find recent orders",
      "GET /orders",
      "reference data",
      "Do not invent endpoints",
    ])
      expect(prompt).toContain(text);
    s.instructions = "";
    s.api = undefined; // Legacy AI-driven API steps still need a prompt.
    expect(() => stepPrompt(w, s, 0)).toThrow();
  });
  it("deduplicates skills and excludes uninstalled plugins and inaccessible apps", () => {
    const skill = {
      name: "Research",
      path: "/skills/research",
      description: "Research things",
      enabled: true,
    };
    const result = normalizeCapabilities(
      { data: [{ skills: [skill, skill] }] },
      {
        marketplaces: [
          {
            plugins: [
              { id: "a", name: "Installed", installed: true, enabled: true },
              { id: "b", installed: false },
            ],
          },
        ],
      },
      [
        { id: "x", isAccessible: false },
        {
          id: "y",
          name: "Calendar",
          description: "Read events",
          isAccessible: true,
          isEnabled: true,
        },
      ],
    );
    expect(result.map((c) => c.kind)).toEqual(["skill", "plugin", "app"]);
    expect(result[2].name).toBe("Calendar");
  });
});
