# Real desktop demonstrations

The older template recordings show MCP Workflow 0.15.0 on Windows; the prompt-to-results recording shows the 0.17.0 desktop build. Frames were captured through the computer-use runtime and encoded with FFmpeg. They contain actual UI execution, with no simulated progress or results. Idle time between inspecting completed results is shortened; active countdowns and collection run at their real pace. There is no narration.

## Prompt to scraper results — shareable video

**[Download the 57-second captioned MP4](amazon-scraper-prompt-to-results.mp4)** (1600 × 1200, 30 fps, H.264/yuv420p, about 1.9 MB, silent with burned-in captions and fast-start playback).

The featured playable video in the main README is a GitHub attachment of this file. It shows an actual desktop session recorded October 30, 2026:

1. Enter the [complete prompt](../../examples/amazon-scraper-builder-prompt.txt) into Build with AI using the existing ChatGPT subscription.
2. Generate a draft with a three-second delay, native scraping steps, a page counter, conditional pagination, a loop and CSV/JSON exports.
3. Review and save that generated graph. AI flags live CSV as unresolved; set its filename prefix in Collect rows. This one manual setting is included in the video.
4. Run that same workflow beside the bundled pages, showing the active step, countdown, counter, True/False condition results and the actual CSV growing from three to five unique rows.
5. Reach End and inspect both the table and raw CSV text.

Generation waiting time and idle review time are shortened. Static UI captures are held for readability; the active run uses timestamped desktop frames at their observed timing. Intro/outro cards and captions are editorial additions. Progress and results are not simulated. The full MP4 decodes successfully, and the CSV/JSON files were independently compared: five matching unique products.

[Recorded workflow JSON](ai-scraper-workflow.json) · [Actual CSV](ai-scraper-products.csv) · [Actual JSON](ai-scraper-products.json). The exported workflow has its local workspace path cleared for portability. Its original AI-written notes retain the uncertainty raised during generation; the live CSV setting was resolved during the recorded review. This is a different AI-generated graph from the older one-click template, with the same requested routing and selectors.

Upload the MP4 as a video when sharing on forums. The fictional-data label is burned into the footage. No live Amazon/AWS requests or forum posts were made.

## Earlier Amazon-style template recording

### Prompt and workflow

Use the [complete AI-builder prompt](../../examples/amazon-scraper-builder-prompt.txt) with **Build with AI**, then inspect and save the generated draft. The prompt describes the starting fixture URL, field selectors, live CSV, conditions, loop, counter limit, delays and final exports. AI builds the plan; native steps execute this scraper without model calls on repeat runs.

The [saved workflow JSON](../../examples/amazon-scraper-demo.json) is the exact template demonstrated in the recording. The [main README includes its flow diagram and expected result](../../README.md#prompt--workflow--results). Import that JSON to reproduce the demonstrated steps exactly; an AI-generated draft may vary.

The prompt was subsequently used in the new prompt-to-results recording above. The older recording below shows only execution of the prebuilt template. Neither uses an AWS service.

### Execution recording

This older `amazon-scraper-demo.mp4` remains available for downloading. The main README now features the prompt-to-results video instead.

`amazon-scraper-demo.mp4` shows the workflow beside the exact bundled HTML pages it fetches. It includes:

1. A real delay countdown before requesting each page.
2. The first page writing three product rows into an actual CSV file.
3. A page counter and the pagination condition taking its True path back to the delay.
4. The second page adding two unique products to the same CSV (one duplicate is ignored).
5. The condition taking its False path, reaching End, and the completed CSV displayed as a table and as raw text.

The recording captured the on-disk file growing from three to five rows, approximately three seconds apart. The live viewer reads file contents back from the Rust backend. It is not a pre-rendered CSV animation. The final CSV and JSON were compared and contain the same five unique products. `products.csv` and `products.json` are copies of those actual output files.

All products and pages are fictional. Links use example.com, and no live Amazon requests were made. The example is an educational demonstration of this source-available tool, without Amazon affiliation.

To reproduce: add **Scraper demo**, choose an existing workspace, open **Live view**, and run. Use **Show CSV** at completion. Each run writes a fresh file. The sample takes 16 step visits: two page cycles plus final exports.

## Delay and counter

`counter-timer-demo.mp4` shows the native [counter and delay template](../../examples/counter-and-delay.json). A real one-second countdown completes before each counter increment. The counter displays 1/3, 2/3 and 3/3, then takes its Limit reached path to End. Its six completed visits are visible in the console.

The recordings, screenshots, fixture pages and sample output follow the repository license.
