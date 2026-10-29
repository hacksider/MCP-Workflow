import { newWorkflow, parseWorkflow, type Workflow } from "./workflow";
export const libraryKey = "mcp-workflow.library.v1";
export const legacyKey = "mcp-workflow.v1";
export type SavedWorkflow = { workflow: Workflow; updatedAt: string };
export type WorkflowLibrary = {
  schemaVersion: 1;
  activeId: string;
  workflows: SavedWorkflow[];
};
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export function createLibrary(workflow = newWorkflow()): WorkflowLibrary {
  return {
    schemaVersion: 1,
    activeId: workflow.id!,
    workflows: [{ workflow, updatedAt: new Date().toISOString() }],
  };
}
export function loadLibrary(storage: StorageAccess): WorkflowLibrary {
  const raw = storage.getItem(libraryKey);
  if (raw !== null) {
    const data = JSON.parse(raw);
    const ids = new Set();
    if (
      data.schemaVersion !== 1 ||
      !Array.isArray(data.workflows) ||
      !data.workflows.length ||
      data.workflows.length > 1000
    )
      throw Error("Invalid workflow library");
    for (const entry of data.workflows) {
      const w = parseWorkflow(JSON.stringify(entry.workflow), true);
      if (
        !entry.workflow.id ||
        ids.has(w.id) ||
        typeof entry.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(entry.updatedAt))
      )
        throw Error("Invalid workflow library entry");
      ids.add(w.id);
      entry.workflow = w;
    }
    if (!ids.has(data.activeId)) throw Error("Missing active workflow");
    return data;
  }
  const legacy = storage.getItem(legacyKey);
  return createLibrary(legacy ? parseWorkflow(legacy) : newWorkflow());
}
export function saveLibrary(storage: StorageAccess, library: WorkflowLibrary) {
  storage.setItem(libraryKey, JSON.stringify(library));
}
export function activeWorkflow(library: WorkflowLibrary): Workflow {
  return library.workflows.find((e) => e.workflow.id === library.activeId)!
    .workflow;
}
export function updateActive(
  library: WorkflowLibrary,
  workflow: Workflow,
): WorkflowLibrary {
  if (workflow.id !== library.activeId)
    throw Error("Cannot change the active workflow identity");
  return {
    ...library,
    workflows: library.workflows.map((e) =>
      e.workflow.id === library.activeId
        ? { workflow, updatedAt: new Date().toISOString() }
        : e,
    ),
  };
}
export function addWorkflow(
  library: WorkflowLibrary,
  workflow: Workflow,
): WorkflowLibrary {
  if (library.workflows.length >= 1000)
    throw Error(
      "The library is full. Export and delete workflows to make room.",
    );
  // Imports and templates always become independent copies, including their run statistics.
  const copy = parseWorkflow(
    JSON.stringify({ ...workflow, id: crypto.randomUUID() }),
  );
  return {
    ...library,
    activeId: copy.id!,
    workflows: [
      { workflow: copy, updatedAt: new Date().toISOString() },
      ...library.workflows,
    ],
  };
}
export function deleteWorkflow(
  library: WorkflowLibrary,
  id: string,
): WorkflowLibrary {
  const workflows = library.workflows.filter((e) => e.workflow.id !== id);
  if (!workflows.length) return createLibrary();
  return {
    ...library,
    workflows,
    activeId:
      library.activeId === id ? workflows[0].workflow.id! : library.activeId,
  };
}
