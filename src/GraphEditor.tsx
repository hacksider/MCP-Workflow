import { useEffect, useMemo, useState } from "react";
import {
  applyNodeChanges,
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  Panel,
  useReactFlow,
  type Node,
  type NodeProps,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Step, Workflow } from "./workflow";
import { connectRoute, routes, type Port } from "./graph";
import { formatDuration } from "./metrics";
type FlowNode = Node<{
  label: string;
  step?: Step;
  status?: string;
  duration?: number;
  terminal?: string;
  selected: boolean;
}>;
function WorkflowNode({ data }: NodeProps<FlowNode>) {
  const ports =
    data.step?.kind === "condition"
      ? [
          ["yes", "True"],
          ["no", "False"],
        ]
      : data.step?.kind === "loop"
        ? [
            ["body", "Repeat"],
            ["after", "Done"],
          ]
        : [[data.terminal === "start" ? "start" : "next", "Next"]];
  return (
    <div
      className={`graph-node ${data.status ?? ""} ${data.selected ? "selected" : ""} ${data.terminal ? "terminal" : ""}`}
    >
      {data.terminal !== "start" && (
        <Handle type="target" position={Position.Top} id="in" />
      )}
      <small>
        {data.terminal
          ? data.terminal === "start"
            ? "BEGINNING"
            : "END"
          : data.step?.kind.toUpperCase()}
      </small>
      <strong>{data.label}</strong>
      {data.status && (
        <span>
          {data.status}
          {data.duration !== undefined
            ? ` · ${formatDuration(data.duration)}`
            : ""}
        </span>
      )}
      {data.terminal !== "end" && (
        <div className="graph-ports">
          {ports.map(([id, label], i) => (
            <div
              key={id}
              style={{ left: `${((i + 1) * 100) / (ports.length + 1)}%` }}
            >
              <span>{label}</span>
              <Handle type="source" position={Position.Bottom} id={id} />
            </div>
          ))}
        </div>
      )}
      {data.step && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="error"
            style={{ background: "#c77855" }}
          />
          <small className="graph-error-port">Error</small>
        </>
      )}
    </div>
  );
}
const nodeTypes = { workflow: WorkflowNode };
const nodeId = (id: string) =>
  id === "$start" || id === "$end" ? id : `step:${id}`;
const stepId = (id: string) => (id.startsWith("step:") ? id.slice(5) : id);
function Canvas({
  workflow,
  onChange,
  onSelect,
  selected,
  running,
  active,
  reachedEnd,
  runs,
  now,
}: {
  now: number;
  workflow: Workflow;
  onChange: (workflow: Workflow) => void;
  onSelect: (id: string) => void;
  selected: string | null;
  running: boolean;
  active: string | null;
  reachedEnd: boolean;
  runs: {
    stepId: string;
    status: string;
    durationMs?: number;
    startedAt: number;
  }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const rf = useReactFlow();
  const nodes: FlowNode[] = useMemo(
    () => [
      {
        id: "$start",
        type: "workflow",
        position: { x: -280, y: 0 },
        draggable: false,
        data: {
          label: "Beginning",
          terminal: "start",
          selected: false,
          status: running && !active ? "running" : undefined,
        },
      },
      ...workflow.steps.map((step, i) => {
        const run = runs.filter((r) => r.stepId === step.id).at(-1);
        return {
          id: nodeId(step.id),
          type: "workflow",
          draggable: !running,
          dragHandle: ".graph-node",
          position: step.position ?? {
            x: (i % 3) * 310,
            y: Math.floor(i / 3) * 180,
          },
          selected: step.id === selected,
          data: {
            label: step.name,
            step,
            selected: step.id === selected,
            status: run?.status,
            duration:
              run?.durationMs ?? (run ? now - run.startedAt : undefined),
          },
        };
      }),
      {
        id: "$end",
        type: "workflow",
        position: {
          x: 930,
          y: Math.max(0, Math.floor((workflow.steps.length - 1) / 3) * 180),
        },
        draggable: false,
        data: {
          label: "End",
          terminal: "end",
          selected: false,
          status: reachedEnd ? "completed" : undefined,
        },
      },
    ],
    [workflow, selected, runs, running, active, reachedEnd, now],
  );
  const [localNodes, setLocalNodes] = useState<FlowNode[]>(nodes);
  useEffect(() => setLocalNodes(nodes), [nodes]);
  const edges: Edge[] = routes(workflow)
    .filter(
      (r) =>
        r.target === "$end" || workflow.steps.some((s) => s.id === r.target),
    )
    .map((r) => ({
      id: `${r.source}:${r.port}`,
      source: nodeId(r.source),
      target: nodeId(r.target),
      sourceHandle: r.port,
      targetHandle: "in",
      label: r.label,
      type: "smoothstep",
      animated: active === r.source,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: {
        stroke: r.port === "error" ? "#c77855" : "#719880",
        strokeWidth: 1.7,
      },
      labelStyle: {
        fill: r.port === "error" ? "#9d573a" : "#476151",
        fontSize: 12,
      },
      data: { source: r.source, port: r.port },
    }));
  useEffect(() => {
    if (!active) return;
    const n = rf.getNode(nodeId(active));
    if (n)
      void rf.setCenter(n.position.x + 120, n.position.y + 50, {
        zoom: Math.max(0.75, rf.getZoom()),
        duration: 300,
      });
  }, [active, rf]);
  useEffect(() => {
    if (reachedEnd) void rf.fitView({ padding: 0.15, duration: 300 });
  }, [reachedEnd, rf]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void rf.fitView({ padding: 0.15, duration: 200 });
    }, 120);
    return () => clearTimeout(timer);
  }, [expanded, rf]);
  const connect = (c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle || running) return;
    onChange(
      connectRoute(
        workflow,
        stepId(c.source),
        c.sourceHandle as Port,
        stepId(c.target),
      ),
    );
  };
  return (
    <div className={`graph-editor ${expanded ? "expanded" : ""}`}>
      <ReactFlow
        nodes={localNodes}
        onNodesChange={(changes) => {
          setLocalNodes((ns) => applyNodeChanges(changes, ns));
          if (running) return;
          const positions = new Map(
            changes.flatMap((c) =>
              c.type === "position" && c.position && c.id.startsWith("step:")
                ? [[stepId(c.id), c.position] as const]
                : [],
            ),
          );
          if (positions.size)
            onChange({
              ...workflow,
              steps: workflow.steps.map((s) =>
                positions.has(s.id)
                  ? { ...s, position: positions.get(s.id)! }
                  : s,
              ),
            });
        }}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.7}
        nodesDraggable={!running}
        nodesConnectable={!running}
        edgesReconnectable={!running}
        deleteKeyCode={null}
        onConnect={connect}
        onReconnect={(old, c) => {
          if (running || !c.source || !c.target || !c.sourceHandle) return;
          let next = workflow;
          const previous = old.data as { source: string; port: Port };
          if (
            previous.source !== stepId(c.source!) ||
            previous.port !== c.sourceHandle
          )
            next = connectRoute(next, previous.source, previous.port, "$end");
          onChange(
            connectRoute(
              next,
              stepId(c.source!),
              c.sourceHandle as Port,
              stepId(c.target!),
            ),
          );
        }}
        onNodeDragStop={(_, node) => {
          if (running || !node.id.startsWith("step:")) return;
          onChange({
            ...workflow,
            steps: workflow.steps.map((s) =>
              s.id === stepId(node.id) ? { ...s, position: node.position } : s,
            ),
          });
        }}
        onNodeClick={(_, node) => {
          if (node.id.startsWith("step:")) {
            onSelect(stepId(node.id));
            setExpanded(false);
          }
        }}
        isValidConnection={(c) => c.source !== "$end" && c.target !== "$start"}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          <span className="graph-hint">
            Drag steps to arrange. Drag dots or line ends to reconnect.
          </span>
        </Panel>
        <Panel position="top-right">
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? "Close expanded view" : "Expand graph"}
          </button>
          <button
            disabled={running}
            onClick={() => {
              onChange({
                ...workflow,
                steps: workflow.steps.map((s) => ({
                  ...s,
                  position: undefined,
                })),
              });
              setTimeout(() => rf.fitView({ padding: 0.15 }), 50);
            }}
          >
            Arrange
          </button>
          <button onClick={() => rf.fitView({ padding: 0.15, duration: 250 })}>
            Fit all
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
export function GraphEditor(props: Parameters<typeof Canvas>[0]) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
