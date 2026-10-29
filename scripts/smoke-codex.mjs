// Read-only protocol verification. Does not create a thread or spend inference usage.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
const child = spawn(
  process.env.MCP_WORKFLOW_CODEX || "codex",
  ["app-server", "--listen", "stdio://"],
  { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
);
const pending = new Map();
let sequence = 0;
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  try {
    const m = JSON.parse(line);
    const p = pending.get(m.id);
    if (p && !m.method) {
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  } catch {}
});
const rpc = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
const timeout = setTimeout(() => {
  console.error("Protocol check timed out");
  child.kill();
  process.exitCode = 1;
}, 90000);
try {
  await rpc("initialize", {
    clientInfo: { name: "mcp_workflow_test", version: "0.6.0" },
    capabilities: { experimentalApi: true },
  });
  child.stdin.write('{"method":"initialized"}\n');
  const a = await rpc("account/read");
  console.log(`Account mode: ${a.account?.type || "signed out"}`);
  const checks = [
    ["skills/list", { cwds: [process.cwd()], forceReload: true }],
    ["mcpServerStatus/list", { limit: 100 }],
    ["plugin/list", { cwds: [process.cwd()] }],
    ["app/list", { limit: 100 }],
    ["model/list", {}],
  ];
  for (const [method, params] of checks) {
    const r = await rpc(method, params);
    const count =
      method === "skills/list"
        ? r.data.reduce((n, e) => n + e.skills.length, 0)
        : method === "plugin/list"
          ? r.marketplaces.reduce(
              (n, m) => n + m.plugins.filter((p) => p.installed).length,
              0,
            )
          : r.data.length;
    console.log(`${method}: OK (${count})`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  lines.close();
  child.kill();
}
