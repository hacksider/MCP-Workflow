import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("src-tauri/resources", { recursive: true });
await build({
  entryPoints: ["scripts/claude-runner.mjs"],
  outfile: "src-tauri/resources/claude-runner.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
await copyFile(
  "node_modules/@anthropic-ai/claude-agent-sdk/README.md",
  "src-tauri/resources/CLAUDE-SDK-NOTICE.md",
);
