import { describe, it, expect, vi } from "vitest";
import template from "../examples/amazon-scraper-demo.json";
import { parseWorkflow, newStep } from "../src/workflow";
import { runGraph, newContext } from "../src/routing";
import { executeNativeStep } from "../src/native";
const calls = vi.hoisted(() => ({
  exports: [] as any[],
  urls: [] as string[],
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command, args: any) => {
    if (command === "fetch_page") {
      calls.urls.push(args.url);
      return { html: args.url, url: args.url };
    }
    if (command === "extract_rows") {
      const first = args.html.endsWith("page-1");
      return {
        rows: first
          ? [{ asin: "a" }, { asin: "b" }, { asin: "c" }]
          : [{ asin: "c" }, { asin: "d" }, { asin: "e" }],
        nextUrl: first ? "fixture://amazon-demo/page-2" : "",
      };
    }
    if (command === "export_rows") {
      calls.exports.push(args);
      return { rows: args.rows.length, path: `demo.${args.format}` };
    }
    throw Error("Unexpected command");
  }),
}));
describe("scraper workflow", () => {
  it("paginates, deduplicates and exports repeatable fresh datasets", async () => {
    const w = parseWorkflow(JSON.stringify(template));
    w.cwd = "C:/work";
    w.steps.find((s) => s.kind === "wait")!.wait!.seconds = 0;
    for (let run = 0; run < 2; run++) {
      const ctx = newContext();
      await runGraph(
        w,
        ctx,
        async (p) => {
          const r = await executeNativeStep(p.step, ctx, w.cwd);
          ctx.steps[p.step.id] = {
            summary: r.summary,
            outputs: JSON.parse(r.outputs),
          };
        },
        () => false,
      );
      expect(ctx.datasets.products.map((r) => r.asin)).toEqual([
        "a",
        "b",
        "c",
        "d",
        "e",
      ]);
    }
    expect(calls.urls).toEqual([
      "fixture://amazon-demo/page-1",
      "fixture://amazon-demo/page-2",
      "fixture://amazon-demo/page-1",
      "fixture://amazon-demo/page-2",
    ]);
    expect(calls.exports).toHaveLength(4);
    expect(calls.exports.every((e) => e.rows.length === 5)).toBe(true);
  });
  it("fails on missing unique keys and observes cancellation while waiting", async () => {
    const ctx = newContext();
    ctx.vars.rows = [{}];
    await expect(
      executeNativeStep(
        {
          ...newStep("collect"),
          collect: {
            source: "{{vars.rows}}",
            dataset: "items",
            uniqueKey: "id",
          },
        },
        ctx,
      ),
    ).rejects.toThrow("Missing unique");
    await expect(
      executeNativeStep(
        { ...newStep("wait"), wait: { seconds: 1 } },
        ctx,
        "",
        () => true,
      ),
    ).rejects.toThrow("Stopped");
  });
});
