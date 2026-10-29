import { useState } from "react";
import { Plus, Upload, ArrowDownToLine, Trash2, X } from "lucide-react";
import type { WorkflowLibrary as Library } from "./library";
export function WorkflowLibrary({
  library,
  onClose,
  onOpen,
  onCreate,
  onDelete,
  onImport,
  onExport,
  startNew = false,
}: {
  library: Library;
  onClose: () => void;
  onOpen: (id: string) => void;
  onCreate: (name: string, description: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onExport: (id: string) => void;
  startNew?: boolean;
}) {
  const [creating, setCreating] = useState(startNew),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [query, setQuery] = useState(""),
    [deleting, setDeleting] = useState<string | null>(null);
  return (
    <div className="modal-backdrop">
      <div
        className="modal workflow-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
      >
        <div className="plugin-browser-title">
          <div>
            <h2 id="library-title">Your workflows</h2>
            <p className="muted">
              Saved on this device. Open a flow or create another repeatable
              task.
            </p>
          </div>
          <button aria-label="Close workflow library" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="library-controls">
          <button onClick={() => setCreating(!creating)}>
            <Plus size={15} />
            New workflow
          </button>
          <button onClick={onImport}>
            <Upload size={15} />
            Import JSON
          </button>
        </div>
        {creating && (
          <form
            className="new-workflow-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onCreate(name.trim(), description.trim());
            }}
          >
            <label>
              Workflow name
              <input
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekly product research"
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should this automation do, and when will you use it?"
              />
            </label>
            <button className="primary" type="submit" disabled={!name.trim()}>
              Create workflow
            </button>
          </form>
        )}
        <label>
          Find workflows
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names and descriptions…"
          />
        </label>
        <div className="saved-workflows">
          {library.workflows
            .filter((e) =>
              `${e.workflow.name} ${e.workflow.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map(({ workflow: w, updatedAt }) => (
              <article className="saved-workflow" key={w.id}>
                <div>
                  <h3>
                    {w.name || "Untitled automation"}
                    {w.id === library.activeId && (
                      <span className="pill">OPEN</span>
                    )}
                  </h3>
                  <p>{w.description || "No description yet."}</p>
                  <small>
                    {w.steps.length} steps · Saved{" "}
                    {new Date(updatedAt).toLocaleString()}
                  </small>
                </div>
                {deleting === w.id ? (
                  <div className="delete-workflow-confirm">
                    <p>
                      Delete “{w.name}” and its run statistics from this device?
                    </p>
                    <button onClick={() => setDeleting(null)}>
                      Keep workflow
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        onDelete(w.id!);
                        setDeleting(null);
                      }}
                    >
                      Delete permanently
                    </button>
                  </div>
                ) : (
                  <div className="saved-workflow-actions">
                    <button onClick={() => onOpen(w.id!)}>Open</button>
                    <button
                      aria-label={`Export ${w.name} as JSON`}
                      onClick={() => onExport(w.id!)}
                    >
                      <ArrowDownToLine size={14} />
                      JSON
                    </button>
                    <button
                      className="danger"
                      aria-label={`Delete ${w.name}`}
                      onClick={() => setDeleting(w.id!)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </article>
            ))}
        </div>
        {!library.workflows.some((e) =>
          `${e.workflow.name} ${e.workflow.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ) && <p className="muted">No matching workflows.</p>}
      </div>
    </div>
  );
}
