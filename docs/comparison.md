# Measured scraper comparison

On October 30, 2026, the saved native workflow engine averaged **6.12 seconds**, compared with **40.05 seconds** for a fresh prompt-driven MCP agent. The ratio of mean times was **6.54×**. Both completed **10/10 trials successfully** and reproduced **200/200 canonical expected fields**, checked independently in both CSV and JSON. No accuracy advantage was observed.

![Measured execution time and output accuracy](charts/scraper-benchmark.png)

## Results

| Metric | Prompt + MCP agent | Saved workflow engine |
| --- | ---: | ---: |
| Mean elapsed | 40.05 s | 6.12 s |
| Median elapsed | 39.51 s | 6.12 s |
| Minimum elapsed | 29.25 s | 6.10 s |
| Maximum elapsed | 55.79 s | 6.17 s |
| Successful trials | 10/10 | 10/10 |
| Correct canonical fields | 200/200 | 200/200 |
| Changed-input cases correct | 5/5 | 5/5 |
| Manual corrections | 0 | 0 |
| Tool errors | 0 | 0 |

## Individual paired trials

| Pair | Frozen input | Agent (s) | Workflow (s) | Both outputs correct |
| --- | --- | ---: | ---: | --- |
| 1 | Unchanged fixture | 42.33 | 6.12 | Yes |
| 2 | Unchanged fixture | 44.41 | 6.10 | Yes |
| 3 | Unchanged fixture | 34.02 | 6.11 | Yes |
| 4 | Unchanged fixture | 29.25 | 6.11 | Yes |
| 5 | Unchanged fixture | 37.73 | 6.11 | Yes |
| 6 | Changed price | 35.84 | 6.13 | Yes |
| 7 | Changed title | 35.67 | 6.12 | Yes |
| 8 | Missing optional price | 44.16 | 6.13 | Yes |
| 9 | Conflicting later duplicate | 41.30 | 6.13 | Yes |
| 10 | Comma and HTML entity | 55.79 | 6.17 | Yes |

## Model tokens per run

| Pair | Agent total | Input | Of which cached | Output | Native workflow total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 182,967 | 181,332 | 143,232 | 1,635 | 0 |
| 2 | 185,533 | 183,586 | 163,968 | 1,947 | 0 |
| 3 | 142,184 | 141,586 | 122,880 | 598 | 0 |
| 4 | 115,581 | 114,274 | 104,576 | 1,307 | 0 |
| 5 | 118,116 | 116,178 | 83,456 | 1,938 | 0 |
| 6 | 116,407 | 114,822 | 82,048 | 1,585 | 0 |
| 7 | 118,093 | 116,177 | 97,408 | 1,916 | 0 |
| 8 | 185,326 | 183,388 | 172,800 | 1,938 | 0 |
| 9 | 183,042 | 181,415 | 170,880 | 1,627 | 0 |
| 10 | 185,795 | 183,824 | 164,224 | 1,971 | 0 |
| **Average** | **153,304.4** | 151,658.2 | 130,547.2 | 1,646.2 | **0** |

Across ten agent runs, Codex reported **1,533,044 total tokens**, including **1,305,472 cached input tokens**. Total is input plus output; cached input is a subset of input, not an extra amount. Reasoning-output telemetry averaged 4.4 tokens per run and is retained in the workbook and raw reports. The native repeat runs invoked no model, so their model-token usage was zero. Builder/setup usage is excluded, and token counts do not establish monetary savings.

## Method

The same saved workflow and the same agent prompt were reused unchanged. Each trial started with empty run-scoped state and a separate output directory. Method order alternated by pair. One pilot per method verified the harness and was stored separately, never pooled with measurements. No measured trial was retried or discarded.

Both methods used the production native step implementation, Rust HTML parser and file writers. The workflow used the production graph executor. A local stdio adapter replaced Tauri transport for the headless test; no substitute scraping algorithm was timed. The agent accessed the same primitives through an MCP server. Its extraction call relays page HTML, rather than using a server-side page handle or a single scrape-and-export tool.

The prompt-driven arm used a fresh ephemeral Codex conversation for every trial, with GPT-6.1 Sol and low reasoning held fixed, authenticated through the existing ChatGPT subscription. Shell, web search, apps, plugins and other configured MCP servers were disabled. The saved graph contained only native steps, so it required no model inference during a repeat run. AI builder and initial authoring time were excluded on both sides.

Timing began before method setup and ended after execution completion and independent validation. It included backend/Codex/MCP startup, three-second waits before each of two fetches, all operations and the agent’s final confirmation. Compilation and fixture generation were excluded. The 180-second completion threshold applied to every trial. Provider prompt caching was not disabled; raw token/cache telemetry is retained. No paid API or live website was used.

## Accuracy and reuse

Each case contained five unique products with asin, title, price and URL: 20 canonical values per trial. Both CSV and JSON had to match explicit expected rows exactly. Missing/wrong fields counted as incorrect; duplicate or extra rows, incorrect columns, missing files, unfinished work, incorrect pacing or a timeout failed the trial. An independent Python standard-library CSV/JSON audit reproduced all 20 run scores, fixture hashes and aggregate mean/median timings.

Pairs 1–5 repeated the original input. Pairs 6–10 changed a price, a title, a missing optional price, a conflicting later duplicate and text containing a comma/HTML entity. Both the unchanged prompt and unchanged graph handled all five changed-input cases correctly. Arbitrary page-layout changes, access blocks and unreliable live services were not tested.

## Limits

This is a small local benchmark of repeat execution on one Windows desktop with uncontrolled background activity and model-service latency. It measures orchestration around a shared scraper, not general reasoning ability or an accuracy benefit from AI. UI rendering, computer use, live Amazon access, AI-heavy workflow steps and setup amortization are outside its scope. Equal observed accuracy on these cases does not prove equivalence on other tasks.

An agent that generates and reuses a script, uses server-side page handles, or calls a higher-level scrape tool is a different baseline and can be closer to native workflow speed. Subscription token usage is not a measured dollar cost, and no monetary savings are claimed.

## Evidence and reproduction

- [Measured workbook](../outputs/2026-10-30-mcp-comparison/mcp-workflow-comparison.xlsx), with native editable charts and formula-linked summaries.
- [Complete measured session](../benchmarks/results/measured-2026-10-30T08-02-42-177Z), including the prompt, graph, fixtures, expected rows, per-trial outputs, logs and raw run ledger.
- [Independent audit](../benchmarks/results/measured-2026-10-30T08-02-42-177Z/independent-audit.json).
- [Reproduction instructions and predeclared cases](../scripts/benchmark/README.md).

MCP defines how a host discovers and calls tools; these results apply to the documented agent/tool configuration, not the protocol universally. [MCP architecture](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/architecture/index.mdx).
