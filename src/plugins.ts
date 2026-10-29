import type { Capability, PlannedStep } from "./workflow";
export type Plugin = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  marketplace: string;
  installed: boolean;
  enabled: boolean;
  version: string | null;
  localVersion: string | null;
  allowed: boolean;
  needsUpdate: boolean;
  featured: boolean;
};
export function pluginCatalog(cli: any, metadata: any): Plugin[] {
  const descriptions = new Map<string, any>();
  for (const market of metadata?.marketplaces ?? [])
    for (const p of market.plugins ?? [])
      descriptions.set(p.id, { ...p, marketplace: market.name });
  const entries = new Map<string, any>();
  for (const p of [...(cli.available ?? []), ...(cli.installed ?? [])])
    entries.set(p.pluginId, p);
  return [...entries.values()]
    .map((p) => {
      const detail = descriptions.get(p.pluginId);
      const local = p.installed
        ? (p.version ?? detail?.localVersion ?? null)
        : null;
      const advertised = detail?.version ?? p.version ?? null;
      // CLI installation receipts are newer than app-server's descriptive cache.
      const latest =
        local &&
        advertised &&
        local.localeCompare(advertised, undefined, { numeric: true }) > 0
          ? local
          : advertised;
      return {
        id: p.pluginId,
        name: p.name,
        displayName: detail?.interface?.displayName || p.name,
        description:
          detail?.interface?.shortDescription ||
          "Plugin with reusable AI capabilities",
        marketplace: p.marketplaceName,
        installed: !!p.installed,
        enabled: !!p.enabled,
        version: latest,
        localVersion: local,
        allowed:
          p.installPolicy === "AVAILABLE" &&
          detail?.availability !== "DISABLED_BY_ADMIN",
        needsUpdate: !!p.installed && !!latest && !!local && latest !== local,
        featured: (metadata?.featuredPluginIds ?? []).includes(p.pluginId),
      };
    })
    .sort(
      (a, b) =>
        Number(b.installed) - Number(a.installed) ||
        Number(b.featured) - Number(a.featured) ||
        a.displayName.localeCompare(b.displayName),
    );
}
export function shortlistPlugins(
  plan: PlannedStep[],
  catalog: Plugin[],
  goal: string,
): Plugin[] {
  const ignored = new Set(
    "the and for with from this that step task flow workflow automation repeat repeated write return text output instructions use using want need add one two before after".split(
      " ",
    ),
  );
  const words = [
    ...new Set(
      `${goal} ${plan.map((p) => `${p.step.name} ${p.step.instructions} ${p.step.endpoint} ${p.step.files?.map((f) => f.name).join(" ") ?? ""}`).join(" ")}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !ignored.has(word)),
    ),
  ];
  const explicit = new Set(explicitPlugins(plan, catalog));
  return catalog
    .filter((p) => p.allowed)
    .map((p) => ({
      p,
      score: words.reduce(
        (n, word) =>
          n +
          (p.displayName.toLowerCase().includes(word) ? 8 : 0) +
          (p.description.toLowerCase().includes(word) ? 1 : 0),
        0,
      ),
    }))
    .filter(
      ({ p, score }) =>
        p.installed || p.featured || explicit.has(p.id) || score > 0,
    )
    .sort(
      (a, b) =>
        Number(explicit.has(b.p.id)) - Number(explicit.has(a.p.id)) ||
        b.score - a.score ||
        Number(b.p.installed) - Number(a.p.installed) ||
        Number(b.p.featured) - Number(a.p.featured),
    )
    .slice(0, 60)
    .map(({ p }) => p);
}
export function validatePluginSelection(
  text: string,
  catalog: Plugin[],
): string[] {
  const decision = JSON.parse(text);
  if (
    !Array.isArray(decision.pluginIds) ||
    decision.pluginIds.length > 20 ||
    decision.pluginIds.some(
      (id: unknown) =>
        typeof id !== "string" ||
        !catalog.some((p) => p.id === id && p.allowed),
    )
  )
    throw new Error(
      "AI requested an unavailable plugin. No plugins were installed.",
    );
  return [...new Set<string>(decision.pluginIds)];
}
export function explicitPlugins(
  plan: PlannedStep[],
  catalog: Plugin[],
): string[] {
  const required = new Set<string>();
  for (const { step } of plan) {
    if (step.kind === "computer") {
      const plugin = catalog.find((p) => p.name === "computer-use");
      if (!plugin?.allowed)
        throw new Error(
          "Computer use is not available in this account catalog. The next step will not start.",
        );
      required.add(plugin.id);
    }
    const c = step.capability;
    if (!c) continue;
    const id =
      c.pluginId || (c.kind === "plugin" ? c.id.replace(/^plugin:/, "") : null);
    if (id) {
      if (!catalog.some((p) => p.id === id))
        throw new Error(`Required plugin is unavailable: ${c.name}`);
      required.add(id);
    }
  }
  return [...required];
}
export function bindRuntimeSkills(
  plan: PlannedStep[],
  skills: Capability[],
  catalog: Plugin[],
): void {
  for (const entry of plan) {
    if (entry.step.kind === "computer") {
      const plugin = catalog.find((p) => p.name === "computer-use");
      const skill = skills.find(
        (c) =>
          c.enabled &&
          c.pluginId === plugin?.id &&
          /computer[- ]use/i.test(c.name),
      );
      if (!skill)
        throw new Error(
          "The computer-use skill is unavailable on this host. The automation was stopped.",
        );
      entry.step.capability = skill;
    } else if (entry.step.capability?.kind === "skill") {
      const previous = entry.step.capability;
      const latest = skills.find(
        (c) =>
          c.name === previous.name &&
          (!previous.pluginId || c.pluginId === previous.pluginId),
      );
      if (!latest?.enabled)
        throw new Error(`Required skill is unavailable: ${previous.name}`);
      entry.step.capability = latest;
    }
  }
}
export const pluginSelectionSchema = {
  type: "object",
  properties: {
    pluginIds: { type: "array", items: { type: "string" }, maxItems: 20 },
  },
  required: ["pluginIds"],
  additionalProperties: false,
};
