import { describe, it, expect } from "vitest";
import {
  activeWorkflow,
  addWorkflow,
  createLibrary,
  deleteWorkflow,
  legacyKey,
  libraryKey,
  loadLibrary,
  saveLibrary,
  updateActive,
} from "../src/library";
import { newWorkflow, newStep, buildRunPlan } from "../src/workflow";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}
describe("saved workflow library", () => {
  it("migrates the previous single workflow without losing its identity or description", () => {
    const store = storage(),
      flow = { ...newWorkflow(), name: "Existing", description: "Saved work" };
    store.setItem(legacyKey, JSON.stringify(flow));
    const lib = loadLibrary(store);
    expect(activeWorkflow(lib)).toEqual(flow);
    saveLibrary(store, lib);
    expect(loadLibrary(store)).toEqual(lib);
    expect(store.getItem(legacyKey)).not.toBeNull();
  });
  it("saves separate workflows and their active selection across reloads", () => {
    const store = storage();
    const first = {
      ...newWorkflow(),
      name: "First",
      description: "First description",
    };
    let lib = addWorkflow(createLibrary(first), {
      ...newWorkflow(),
      name: "Second",
      description: "Second description",
    });
    lib = updateActive(lib, {
      ...activeWorkflow(lib),
      description: "Updated second",
    });
    saveLibrary(store, lib);
    const loaded = loadLibrary(store);
    expect(activeWorkflow(loaded).description).toBe("Updated second");
    expect(loaded.workflows[1].workflow.description).toBe("First description");
  });
  it("imports the same exported JSON as independent copies without changing the original", () => {
    const first = {
      ...newWorkflow(),
      name: "Original",
      steps: [newStep("instruction")],
    };
    const original = createLibrary(first);
    const imported = JSON.parse(JSON.stringify(first));
    const next = addWorkflow(addWorkflow(original, imported), imported);
    expect(new Set(next.workflows.map((e) => e.workflow.id)).size).toBe(3);
    expect(original.workflows).toHaveLength(1);
    next.workflows[0].workflow.steps[0].name = "Changed";
    expect(first.steps[0].name).not.toBe("Changed");
  });
  it("deletes only the chosen workflow and keeps a usable editor after deleting the last", () => {
    const first = createLibrary();
    const two = addWorkflow(first, newWorkflow());
    const active = two.activeId;
    const one = deleteWorkflow(two, first.activeId);
    expect(one.activeId).toBe(active);
    expect(one.workflows).toHaveLength(1);
    const empty = deleteWorkflow(one, active);
    expect(empty.workflows).toHaveLength(1);
    expect(empty.activeId).not.toBe(active);
    expect(activeWorkflow(empty).steps).toEqual([]);
  });
  it("restores unfinished form drafts but keeps execution validation strict", () => {
    const flow = newWorkflow();
    const form = newStep("form");
    form.formFields![0].id = "";
    form.repeat = 0;
    flow.steps = [form];
    flow.cwd = "C:/work";
    expect(() => buildRunPlan(flow)).toThrow();
    const store = storage();
    saveLibrary(store, createLibrary(flow));
    expect(activeWorkflow(loadLibrary(store)).steps[0]).toEqual(form);
  });
  it("reports corrupt storage and write failures instead of pretending a save succeeded", () => {
    const store = storage();
    store.setItem(libraryKey, "bad JSON");
    expect(() => loadLibrary(store)).toThrow();
    expect(() =>
      saveLibrary(
        {
          getItem: () => null,
          setItem: () => {
            throw Error("quota");
          },
        },
        createLibrary(),
      ),
    ).toThrow("quota");
  });
});
