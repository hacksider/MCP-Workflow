# Real desktop demonstrations

These recordings show MCP Workflow 0.15.0 on Windows. Frames were captured through the computer-use runtime and encoded with FFmpeg. They contain actual UI execution, with no simulated progress or results. Idle time between inspecting completed results is shortened; active countdowns and collection run at their real pace. There is no narration.

## Amazon-style scraper

This is the featured playable video in the [main README](../../README.md#amazon-scraper-demo). The GitHub attachment is a copy of `amazon-scraper-demo.mp4`; the repository copy remains available for downloading.

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
