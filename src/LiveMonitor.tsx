import { formatCountdown } from "./timers";
import { useMemo, useState } from "react";
import { GraphEditor } from "./GraphEditor";
import type { Workflow } from "./workflow";
export type MonitorData = {
  page?: { url: string; html: string; pageNumber?: number; preview?: boolean };
  csv?: { path: string; contents: string; rows: number };
  condition?: string;
};
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
export function safePreview(html: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>a,button,input,select,textarea{pointer-events:none}</style>${html}`;
}
export function LiveMonitor({
  workflow,
  data,
  running,
  active,
  reachedEnd,
  runs,
  now,
  onRun,
  onClose,
  onOpenCsv,
}: {
  workflow: Workflow;
  data: MonitorData;
  running: boolean;
  active: string | null;
  reachedEnd: boolean;
  runs: {
    stepId: string;
    status: string;
    durationMs?: number;
    startedAt: number;
    endsAt?: number;
    counter?: { count: number; limit: number };
  }[];
  now: number;
  onRun: () => void;
  onClose: () => void;
  onOpenCsv: (path: string) => void;
}) {
  const [csvOnly, setCsvOnly] = useState(false),
    [raw, setRaw] = useState(false);
  const rows = useMemo(
    () => parseCsv(data.csv?.contents ?? ""),
    [data.csv?.contents],
  );
  const page = useMemo(
    () =>
      safePreview(
        data.page?.html ??
          '<body style="font:16px system-ui;padding:25px">Waiting for a Fetch page step. The demo uses bundled fictional pages.</body>',
      ),
    [data.page?.html],
  );
  const activeName = workflow.steps.find((s) => s.id === active)?.name;
  const activeRun = runs.filter((r) => r.stepId === active).at(-1);
  const lastCounter = runs.filter((r) => r.counter).at(-1)?.counter;
  return (
    <div
      className="live-monitor"
      role="dialog"
      aria-modal="true"
      aria-label="Live scraper demonstration"
    >
      <header>
        <div>
          <h2>{workflow.name}</h2>
          <small>
            {running
              ? `Running: ${activeName ?? "Preparing"}${activeRun?.endsAt ? ` · ${formatCountdown(activeRun.endsAt - now)} remaining` : ""}`
              : reachedEnd
                ? "Reached End · run completed"
                : "Page preview · ready to run"}
          </small>
          {lastCounter && (
            <span className="monitor-counter">
              Counter: {lastCounter.count} / {lastCounter.limit}
            </span>
          )}
        </div>
        <div className="monitor-actions">
          <button
            disabled={running && !data.csv}
            onClick={() => setCsvOnly(!csvOnly)}
          >
            {csvOnly ? "Show workflow & page" : "Show CSV"}
          </button>
          <button className="primary" onClick={onRun}>
            {running ? "Stop run" : reachedEnd ? "Run again" : "Run workflow"}
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </header>
      {!csvOnly && (
        <div className="monitor-grid">
          <section>
            <h3>Workflow · Beginning → conditions / loops → End</h3>
            <GraphEditor
              workflow={workflow}
              onChange={() => {}}
              onSelect={() => {}}
              selected={active}
              running={running}
              active={active}
              reachedEnd={reachedEnd}
              runs={runs}
              now={now}
            />
            <div className="condition-signal">
              {data.condition ??
                "Condition results will appear here as the workflow runs."}
            </div>
          </section>
          <section>
            <h3>
              Actual fetched demo page{" "}
              {data.page?.pageNumber ? `· page ${data.page.pageNumber}` : ""}
            </h3>
            <div className="preview-url">
              {data.page?.url ?? "Waiting for page"}
              {data.page?.preview ? " · preview before run" : ""}
            </div>
            <iframe
              title="Fetched page preview"
              sandbox=""
              tabIndex={-1}
              srcDoc={page}
            />
          </section>
        </div>
      )}
      <section className={`live-csv ${csvOnly ? "focused" : ""}`}>
        <div className="csv-heading">
          <div>
            <h3>
              CSV on disk · {data.csv?.rows ?? 0} rows {running ? "· LIVE" : ""}
            </h3>
            <small>
              {data.csv?.path?.replace(/^\\\\\?\\/, "") ??
                "The Collect rows step creates the file when its first rows arrive."}
            </small>
          </div>
          <div className="monitor-actions">
            <button onClick={() => setRaw(!raw)}>
              {raw ? "Table view" : "CSV text"}
            </button>
            <button
              disabled={running || !data.csv}
              onClick={() => data.csv && onOpenCsv(data.csv.path)}
            >
              Open CSV file
            </button>
          </div>
        </div>
        {data.csv ? (
          raw ? (
            <pre>{data.csv.contents.slice(0, 100000)}</pre>
          ) : (
            <div className="live-csv-table">
              <table>
                <thead>
                  <tr>
                    {rows[0]?.map((v, i) => (
                      <th key={i}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1, 101).map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 101 && (
                <p>
                  Showing the first 100 rows. Open the file for all results.
                </p>
              )}
            </div>
          )
        ) : (
          <p className="muted">
            No rows written yet. Enable a live CSV filename on Collect rows,
            then run the workflow.
          </p>
        )}
      </section>
    </div>
  );
}
