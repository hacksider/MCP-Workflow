# Matched scraper benchmark

This compares repeated execution of the application's saved native scraper graph with a fresh prompt-driven Codex agent calling the same primitives over MCP. It does not compare the underlying intelligence of different models or claim an advantage for every workflow.

## Run it

Requirements: the project's Node/Rust dependencies, Codex CLI signed in with a ChatGPT subscription, and no other benchmark running. Agent trials consume subscription inference usage. No OpenAI API key or live website is used.

```sh
npm install
cargo build --release --manifest-path src-tauri/Cargo.toml --bin workflow-benchmark-backend
node scripts/benchmark/run.mjs --pilot
node scripts/benchmark/run.mjs
```

The pilot checks protocol wiring and is stored separately. It is never pooled with the ten measured pairs. Do not tune either method after viewing a measured result; change the protocol and start a separate session if changes are necessary.

## What is held constant

- The same two frozen fictional catalog pages, four required output columns, first-occurrence deduplication rule, maximum three pages, CSV/JSON output requirement, and three-second delay before every page fetch.
- The agent's prompt and the saved workflow are reused unchanged across all measured cases. Both begin with empty run-scoped state and separate output directories. Method order alternates by pair.
- Both methods call production `executeNativeStep`, Rust HTML extraction and file writers. The workflow additionally uses the production `runGraph` executor. Only the Tauri invocation transport is replaced by a local stdio adapter; no replacement scraper algorithm is timed.
- Codex uses a fresh ephemeral conversation for each trial. The configured model and reasoning effort from the first measured trial are held fixed. Shell, web search, plugins, apps and other configured MCP servers are disabled. Only the local catalog MCP server is provided. No subagents or manual corrections are used.

The workflow contains native steps and therefore invokes no model during repeated execution. The model applies only to the prompt-driven arm. AI builder/setup time is not included on either side.

## Cases declared before the measured run

| Pair | Input |
| --- | --- |
| 1–5 | Original bundled fixture, unchanged |
| 6 | A product price changes |
| 7 | A product title changes |
| 8 | One optional price is missing |
| 9 | A later duplicate contains conflicting data |
| 10 | A title contains a comma and an HTML entity |

Every case has five unique products. All 20 canonical fields are checked independently against explicit expected data in both CSV and JSON. Missing or incorrect fields count as incorrect. Duplicate/extra rows, extra/missing columns, missing files, an unfinished agent, incorrect pacing or failure to finish within 180 seconds fail the trial. A delay must actually finish before each fetch. Internal tool errors remain in the evidence even if the agent recovers. There are no automatic whole-trial retries and no failed trials are discarded.

## Timing and limits

The timer starts before method setup and ends after execution completion and independent file validation. It includes native backend startup, or Codex/MCP startup for the agent, both deliberate waits, tool work and the agent's final confirmation. Compilation, fixture creation and initial workflow/prompt authoring are excluded. The service's prompt cache is not disabled; reported cached-token usage is retained where available. UI rendering, browser automation, Internet scraping latency and AI-heavy workflow steps are not measured.

This is a local headless execution benchmark on one Windows desktop with uncontrolled background activity and service latency. Ten trials per arm and a small synthetic catalog are limited evidence. Equal observed accuracy is not proof of equivalence on other inputs. An agent that creates and reuses a script, or receives a single higher-level scrape tool, is a different baseline and may be much closer to native workflow speed.

## Evidence

Each session under `benchmarks/results/` contains the exact prompt and workflow, metadata, fixture hashes, frozen HTML inputs, expected rows, all per-trial output files and operation logs, a run ledger and calculated summary. Review the raw files rather than relying on the agent's success message. Scratch processes and files use an isolated temporary directory; the copied evidence contains only fictional data and benchmark configuration, not credentials.
