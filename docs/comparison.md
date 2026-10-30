# Prompt-driven agents and saved workflows

The [comparison workbook](../outputs/2026-10-30-mcp-comparison/mcp-workflow-comparison.xlsx) compares task setup, repeated-run speed, output accuracy, reuse, AI workflow creation, branches, retries, visibility, sharing, cost and maintenance.

The comparison is qualitative. No matched benchmark establishes that this app is faster or more accurate than a prompt-driven MCP agent. MCP supplies a protocol for tools and context; scheduling, memory, retries and other agent behavior depend on the host. An agent can also create reusable scripts, so saved prompts are not the limit of what an agent can do.

Saved native steps can avoid repeated planning and inference, but AI-heavy workflows still use the selected model and can add per-step overhead. Fixed routing improves procedural consistency. It does not prove output correctness, and incorrect selectors or rules repeat the same mistake.

The workbook includes the existing fictional scraper demo's observed CSV row counts, with an editable chart. Counts matched three rows after page one and five unique rows after page two. This is evidence about that fixture, not an agent comparison or a general accuracy rate. The recording's duration is not execution time.

Use the blank Benchmark sheet to measure both methods with the same model, tools, inputs, expected output and timeout. Enter ten paired runs, including failed attempts and human corrections. The sheet calculates mean elapsed time, field accuracy, success rate, human fixes, speedup and accuracy difference. Empty inputs remain unavailable. Synthetic inputs used to verify formulas were removed before saving.

Sources: [MCP architecture](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/architecture/index.mdx), the application's README and implementation, and [actual demonstration notes](demo/README.md).
