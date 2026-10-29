# MCP Workflow

**Create a task once. Run it again whenever you need.**

A desktop AI automation builder for prompts, files, forms, APIs and web scraping. Connect steps, add branches and loops, and watch the active step glow until the task finishes. Tools run behind the scenes.

Current version: **0.11.3** · Tauri + React + Rust · Windows installer

![The actual desktop scraper workflow](docs/screenshots/scraper-setup.png)

## Try the scraper demo

1. Open the desktop app and click **Scraper demo**.
2. In **Workflow settings**, choose an existing workspace folder.
3. Click **Run workflow**, inspect the results, then **Run again**.

The Amazon-style example uses **fictional bundled pages**. It fetches two pages, extracts products, follows pagination, removes duplicates and saves **five products** as CSV and JSON. No account or live Amazon access is required. This is a basic demonstration of how the tool works, not an Amazon integration.

[![Watch the desktop demo](docs/screenshots/scraper-completed.png)](docs/demo/amazon-scraper-demo.mp4)

**[Watch the video](docs/demo/amazon-scraper-demo.mp4)** · [Template JSON](examples/amazon-scraper-demo.json) · [Example output](docs/demo/products.json)

## Build your own flow

Click an element in the left sidebar, configure it, then choose its next step.

| Element | Use it to… |
| --- | --- |
| Instructions | Tell the AI what to do in plain language |
| Upload / Form | Supply files or collect AI-filled structured answers |
| API | Make GET, POST, PUT, PATCH or DELETE calls; or describe an operation for AI |
| Set values | Define inputs and update variables |
| Fetch page / Extract data | Read HTML and select rows, text and attributes |
| Collect rows / Export file | Remove duplicates and save CSV or JSON |
| Condition / Loop / Wait | Branch, repeat steps and pace requests |
| Computer task | Interact with a browser or app when a compatible runtime is available |

**Great first flows:**

- **Compare documents:** Upload → Instructions (“compare the quotes; never guess missing prices”) → Form.
- **Scrape a catalog:** Set URL → Wait → Fetch → Extract → Collect → Condition → next page or Export.
- **Process API records:** API GET → Instructions → Form → API update.

Every action finishes before routing to the next step. Each run has fresh data; saved flows are repeatable. Repeating API writes or computer actions can repeat their external effects. The console shows step durations, total time, run counts and average times.

Choose **ChatGPT subscription, Claude subscription, OpenAI API, Claude API or Bedrock** in Workflow settings. Native scraper and direct API steps work without an AI provider. Expand **Skills, plugins & apps** to browse Codex capabilities and download available plugins. Needed Codex plugins are selected automatically; Claude uses its own runtime configuration.

## Run from source

Install Node.js 20+, Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run desktop
```

AI steps additionally need the selected provider's runtime and sign-in or credentials. [Setup, references, loops, examples and limits →](docs/guide.md)

Manual runs are supported. Scheduling and unattended operation are not implemented. Live scraping requires permitted access and selectors suited to the site's HTML; JavaScript rendering and access-block bypass are not built into Fetch page.

## License

**Free for personal noncommercial use. Commercial use requires a separate paid license.** See [LICENSE](LICENSE) and [commercial licensing](COMMERCIAL-LICENSE.md). Commercial pricing is not set yet.

The code is **source-available under PolyForm Noncommercial**, not GPL or unrestricted open source. GPL permits commercial use, so it does not match this licensing requirement. Dependencies retain their own licenses.
