import { describe, expect, it } from "vitest";
import {
  explicitPlugins,
  pluginCatalog,
  validatePluginSelection,
  shortlistPlugins,
} from "../src/plugins";
import { buildRunPlan, newStep, newWorkflow } from "../src/workflow";
describe("needed plugin downloads", () => {
  it("bounds large marketplace prompts while keeping relevant plugins", () => {
    const catalog = pluginCatalog(
      {
        available: Array.from({ length: 9000 }, (_, i) => ({
          pluginId: `p${i}@m`,
          name: `p${i}`,
          marketplaceName: "m",
          installPolicy: "AVAILABLE",
        })),
      },
      {
        marketplaces: [
          {
            plugins: [
              {
                id: "p8999@m",
                interface: {
                  displayName: "Calendar",
                  shortDescription: "Manage calendar events",
                },
              },
            ],
          },
        ],
      },
    );
    const w = newWorkflow();
    w.cwd = "F:/workspace";
    w.steps = [newStep("instruction")];
    w.steps[0].instructions = "Check calendar events";
    const selected = shortlistPlugins(buildRunPlan(w), catalog, w.description);
    expect(selected.length).toBeLessThanOrEqual(60);
    expect(selected.some((p) => p.id === "p8999@m")).toBe(true);
  });
  const cli = {
    installed: [
      {
        pluginId: "a@m",
        name: "a",
        marketplaceName: "m",
        version: "1",
        installed: true,
        enabled: true,
        installPolicy: "AVAILABLE",
      },
    ],
    available: [
      {
        pluginId: "b@m",
        name: "b",
        marketplaceName: "m",
        version: "2",
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
      },
      {
        pluginId: "denied@m",
        name: "denied",
        marketplaceName: "m",
        installPolicy: "NOT_AVAILABLE",
      },
    ],
  };
  const metadata = {
    marketplaces: [
      {
        plugins: [
          {
            id: "a@m",
            version: "2",
            localVersion: "1",
            interface: {
              displayName: "Calendar",
              shortDescription: "Schedule work",
            },
          },
        ],
      },
    ],
  };
  it("keeps uninstalled plugins, readable metadata, and update availability", () => {
    const rows = pluginCatalog(cli, metadata);
    expect(rows.find((p) => p.id === "a@m")).toMatchObject({
      displayName: "Calendar",
      needsUpdate: true,
    });
    expect(rows.find((p) => p.id === "b@m")?.installed).toBe(false);
  });
  it("prefers an installed CLI version over stale descriptive metadata after an update", () => {
    const rows = pluginCatalog(
      { installed: [{ ...cli.installed[0], version: "3" }] },
      metadata,
    );
    expect(rows[0]).toMatchObject({
      localVersion: "3",
      version: "3",
      needsUpdate: false,
    });
  });
  it("validates every AI-selected dependency before installing any", () => {
    const rows = pluginCatalog(cli, metadata);
    expect(
      validatePluginSelection('{"pluginIds":["b@m","b@m"]}', rows),
    ).toEqual(["b@m"]);
    for (const pluginIds of [["invented@m"], ["denied@m"], [42]])
      expect(() =>
        validatePluginSelection(JSON.stringify({ pluginIds }), rows),
      ).toThrow();
  });
  it("collects the owning plugin for skill steps and deduplicates repetitions", () => {
    const w = newWorkflow();
    w.cwd = "F:/workspace";
    w.steps = [
      newStep("skill", {
        id: "skill:/x",
        name: "Plan",
        description: "Plan",
        kind: "skill",
        path: "/x",
        pluginId: "b@m",
        enabled: true,
      }),
    ];
    w.steps[0].instructions = "Plan a task";
    w.steps[0].repeat = 2;
    expect(
      explicitPlugins(buildRunPlan(w), pluginCatalog(cli, metadata)),
    ).toEqual(["b@m"]);
  });
});
