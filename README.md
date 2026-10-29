# MCP Workflow

Version **0.1.0**. A Tauri 2 desktop workflow studio using React, TypeScript, and a Rust bridge to local Codex app-server.

Build repeatable AI workflows from the skills, plugins, apps, and MCP tools your local Codex session can access. Add open-ended instructions to each step, carry context through the flow, and describe API operations in plain language alongside their documentation. The purpose is to make these capabilities usable as an ordered, inspectable process with visible results and approvals.

## Screenshots

Actual Windows Tauri application, captured during verification:

![Workflow studio before connecting](docs/screenshots/workflow-studio.png)

![Connected ChatGPT session with discovered capabilities and a completed two-step workflow](docs/screenshots/completed-workflow.png)

![API flow editor with a clearly labeled example endpoint and documentation](docs/screenshots/api-flow.png)

## License

**Free for personal noncommercial use. Commercial use requires a separate paid license.** The source is available under [PolyForm Noncommercial 1.0.0](LICENSE); see [commercial licensing](COMMERCIAL-LICENSE.md) for requests. Pricing and commercial agreements are not configured yet. This release has no payment or license-key enforcement.

PolyForm also permits other noncommercial purposes and qualifying noncommercial organizations under its exact terms. This is a source-available project. It is not GPL: the [GNU GPL permits commercial use and cannot add a commercial-use prohibition](https://www.gnu.org/licenses/gpl-faq.html#NoMilitary). Third-party dependencies retain their own licenses.

## Run

Requires Node.js, Rust, the platform's [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), and Codex installed. On Windows, the app also discovers the Codex desktop executable. Set `MCP_WORKFLOW_CODEX` to an absolute executable path to override discovery.

```powershell
npm install
npm run desktop
```

Use **Connect Codex**, enter an existing absolute workspace folder, then **Discover capabilities**. The app uses Codex's existing sign-in. If signed out, use **Sign in with ChatGPT** to complete Codex's browser login. A ChatGPT subscription with Codex access is required for subscription-backed runs; the app does not extract browser cookies or copy credentials. Login affects the local Codex account shared with other Codex clients.

The browser-only preview (`npm run dev`) supports workflow editing, import, and export; execution and discovery require the desktop app.

To verify your session, import [examples/connection-check.json](examples/connection-check.json), set your workspace folder, and run it. Its two instruction steps make no tool calls: the second repeats the first step's token to verify conversation continuity. Running it consumes your normal Codex plan allowance.

For an API flow, import [examples/api-starter.json](examples/api-starter.json) and replace the example endpoint, reference documentation, and instructions with your own before running. The included `api.example.com` address is a placeholder, not a working service.

## Build a workflow

- Search automatically discovered skills, installed plugins, accessible apps, and configured MCP tools in the sidebar; click a capability to add a step. Disabled capabilities cannot be added.
- Add instruction steps with freeform text, or API flows with an HTTP(S) website/endpoint, documentation or documentation URLs, and plain-language instructions.
- Set shared workflow instructions and an optional model in workflow settings. Steps run sequentially in one Codex thread, carrying earlier outputs forward. Reorder or delete steps from their details panel.
- Run the workflow to stream results and tool activity. Command and file approvals are shown for explicit approval. User-input requests are supported; unsupported requests can be declined. Additional permission requests are conservatively declined by this version. Stop interrupts the active turn and prevents subsequent steps.
- Definitions save automatically to local webview storage. Export/import JSON for backups and sharing. Import replaces the current definition; export first if you want to keep it. Do not include secrets: definitions and exported JSON are plaintext.

## Connection scope and API execution

The integration uses [Codex app-server](https://learn.chatgpt.com/docs/app-server), not a connection back into this development chat. Discovery reflects the local Codex process, workspace, account, configuration, and enabled plugins. ChatGPT-only connectors and plugins are not automatically transferable. Configure the corresponding MCP server or Codex plugin separately when missing. Discovery reports partial errors rather than inventing capabilities.

API steps ask Codex to read the supplied reference, determine the request, and perform it with available tools. API authentication must already be available to those tools or supplied through their supported authentication flow. Endpoint text alone does not establish credentials or guarantee that an API is callable. Reference documentation is sent as untrusted data. API steps use Codex's shell/MCP capabilities, so CORS is not a browser limitation. No arbitrary JavaScript or direct HTTP client is injected into the webview.

The app requests a workspace-write sandbox and on-request approvals; managed Codex policy may further restrict access. Each step returns a structured outcome: completed, blocked, or failed. Only a completed outcome advances the workflow. Failed/interrupted turns, missing or invalid outcomes, and model-reported blockers stop the sequence. These outcomes are reported by the model, not independent proof that an external business operation succeeded; review the returned response and outputs. Run output stays in memory for the current app session; Codex may retain local thread history according to its configuration.

## Verification and packaging

```powershell
npm run check
node scripts/smoke-codex.mjs
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

The smoke check performs account and capability discovery only; it does not start inference or print credentials. `desktop:build` produces the Windows executable and NSIS installer under `src-tauri/target/release/`. Other operating systems require their own builds and bundle-target configuration. Codex must be installed on the destination machine; it is not bundled. App-server protocol availability varies by Codex version; update Codex if a method is unsupported.

Initial verification on Windows with Codex `0.165.0-alpha.1.2`: production frontend build, five workflow validation tests, Rust compilation, read-only account/capability discovery, and a real two-step ChatGPT-backed run with conversation continuity. The UI screenshots above are from this desktop run. API calls depend on each API's documentation, authentication, and available tools; no authenticated third-party API write was performed during verification.

## Project maintenance

Every completed change should update this README when the application's purpose, features, setup instructions, behavior, or limitations change. Refresh real application screenshots when the UI changes and capture them when practical. Keep the documented version, application manifests, and lockfiles synchronized; see [AGENTS.md](AGENTS.md).
