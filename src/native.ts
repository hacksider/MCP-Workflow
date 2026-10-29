import { maxDelaySeconds } from "./timers";
import { invoke } from "@tauri-apps/api/core";
import { conditionResult, resolve, type Context } from "./routing";
import type { Step, Workflow } from "./workflow";
export const isNativeStep = (step: Step) =>
  (step.kind === "api" && !!step.api) ||
  [
    "counter",
    "condition",
    "loop",
    "values",
    "fetch",
    "extract",
    "collect",
    "wait",
    "export",
  ].includes(step.kind);
export const needsAgent = (workflow: Workflow) =>
  workflow.steps.some((s) => !isNativeStep(s));
export async function executeNativeStep(
  step: Step,
  context: Context,
  cwd = "",
  cancelled: () => boolean = () => false,
  heartbeat: () => void = () => {},
): Promise<{ status: "completed"; summary: string; outputs: string }> {
  const done = (summary: string, outputs: unknown) => ({
    status: "completed" as const,
    summary,
    outputs: JSON.stringify(outputs),
  });
  if (step.kind === "values") {
    const values = JSON.parse(step.values ?? "{}");
    if (!values || Array.isArray(values) || typeof values !== "object")
      throw Error("Values must be a JSON object");
    const deep = (v: any): any =>
      typeof v === "string"
        ? resolve(v, context)
        : Array.isArray(v)
          ? v.map(deep)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, deep(x)]),
              )
            : v;
    const result = deep(values);
    for (const [k, v] of Object.entries(result)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        throw Error("Invalid variable name");
      context.vars[k] = v;
    }
    return done("Updated workflow values", result);
  }
  if (step.kind === "fetch") {
    if (
      !step.fetch ||
      !Number.isInteger(step.fetch.maxPages) ||
      step.fetch.maxPages < 1 ||
      step.fetch.maxPages > 1000
    )
      throw Error("Fetch needs a page limit from 1 to 1000");
    const count = (context.steps[step.id]?.outputs.pageNumber ?? 0) + 1;
    if (count > step.fetch.maxPages)
      throw Error("Fetch page limit reached; check pagination");
    const url = String(resolve(step.fetch.url, context));
    const result = await invoke<any>("fetch_page", { url });
    return done(`Fetched page ${count}: ${url}`, {
      ...result,
      pageNumber: count,
    });
  }
  if (step.kind === "extract") {
    const c = step.extract;
    if (!c) throw Error("Configure extraction");
    const page = resolve(c.source, context);
    if (!page || typeof page.html !== "string")
      throw Error("Extraction source must be a fetched page result");
    const result = await invoke<any>("extract_rows", {
      html: page.html,
      baseUrl: page.url,
      rowSelector: c.rowSelector,
      fields: c.fields,
      nextSelector: c.nextSelector,
    });
    return done(`Extracted ${result.rows.length} rows`, result);
  }
  if (step.kind === "collect") {
    const c = step.collect;
    if (!c) throw Error("Configure collection");
    const rows = resolve(c.source, context);
    if (!Array.isArray(rows)) throw Error("Collection source must be an array");
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c.dataset))
      throw Error("Use a simple dataset name");
    const prior = context.datasets[c.dataset] ?? [];
    const combined = [...prior];
    const seen = new Set(
      prior.map((r) => JSON.stringify(c.uniqueKey ? r[c.uniqueKey] : r)),
    );
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw Error("Collection rows must be objects");
      if (
        c.uniqueKey &&
        (row[c.uniqueKey] === undefined ||
          row[c.uniqueKey] === null ||
          row[c.uniqueKey] === "")
      )
        throw Error("Missing unique key in row");
      const key = JSON.stringify(c.uniqueKey ? row[c.uniqueKey] : row);
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(row);
      }
    }
    if (combined.length > 100000 || JSON.stringify(combined).length > 20000000)
      throw Error("Dataset limit exceeded");
    context.datasets[c.dataset] = combined;
    if (c.liveCsvName && combined.length) {
      context.liveCsv ??= {};
      context.liveCsv[c.dataset] = await invoke<any>("write_live_csv", {
        cwd,
        name: c.liveCsvName,
        sessionId: context.liveCsv[c.dataset]?.sessionId ?? null,
        rows: combined,
      });
    }
    return done(
      `Collected ${combined.length - prior.length} new rows (${combined.length} total)`,
      { added: combined.length - prior.length, total: combined.length },
    );
  }
  if (step.kind === "counter") {
    const c = step.counter;
    if (!c || !Number.isInteger(c.limit) || c.limit < 1 || c.limit > 1000000)
      throw Error("Counter needs a valid limit");
    const count = (context.steps[step.id]?.outputs.count ?? 0) + 1;
    return done(
      `Counter ${count} / ${c.limit} · ${count >= c.limit ? "limit reached" : "below limit"}`,
      { count, limit: c.limit, reached: count >= c.limit },
    );
  }
  if (step.kind === "wait") {
    const seconds = step.wait?.seconds;
    if (
      seconds === undefined ||
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      seconds > maxDelaySeconds
    )
      throw Error("Delay must be from 0 seconds to 365 days");
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      heartbeat();
      if (cancelled()) throw Error("Stopped");
      await new Promise((r) =>
        setTimeout(r, Math.min(100, until - Date.now())),
      );
    }
    return done(`Waited ${seconds} seconds`, { seconds });
  }
  if (step.kind === "export") {
    const c = step.export;
    if (!c) throw Error("Configure export");
    const rows = context.datasets[c.dataset];
    if (!rows?.length) throw Error("Dataset is empty");
    if (c.format === "csv" && context.liveCsv?.[c.dataset])
      return done(
        `Saved ${rows.length} rows to ${context.liveCsv[c.dataset].path}`,
        { ...context.liveCsv[c.dataset], contents: undefined },
      );
    const result = await invoke<any>("export_rows", {
      cwd,
      name: c.name,
      format: c.format,
      rows,
    });
    return done(`Exported ${rows.length} rows to ${result.path}`, result);
  }
  if (step.kind === "condition" || step.kind === "loop")
    return {
      status: "completed",
      summary:
        step.kind === "condition"
          ? `Condition: ${conditionResult(step.condition!, context)}`
          : `Loop gate (${step.loop!.times} iterations)`,
      outputs: JSON.stringify(
        step.kind === "condition"
          ? { matched: conditionResult(step.condition!, context) }
          : { times: step.loop!.times },
      ),
    };
  if (step.kind === "api" && step.api) {
    const headers = resolve(step.api.headers, context);
    const body = resolve(step.api.body, context);
    const data = await invoke<any>("http_request", {
      url: String(resolve(step.endpoint, context)),
      method: step.api.method,
      headers: typeof headers === "string" ? JSON.parse(headers) : headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
      authEnv: step.api.authEnv,
    });
    if (data.status < 200 || data.status >= 300)
      throw new Error(
        `HTTP ${data.status}: ${JSON.stringify(data.body).slice(0, 4000)}`,
      );
    return {
      status: "completed",
      summary: `${step.api.method} ${step.endpoint} → HTTP ${data.status}`,
      outputs: JSON.stringify(data),
    };
  }
  throw new Error("Unsupported native step");
}
