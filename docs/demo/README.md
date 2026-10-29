# Scraper demonstration assets

`amazon-scraper-demo.mp4` is a real screen recording of MCP Workflow 0.11.2 on Windows, captured through the computer-use runtime and encoded with FFmpeg. It shows a repeated run of the bundled Amazon-style fixture template, its active-step glow, completion counts and exported JSON path. The brief final cut removes idle time between inspecting results. There is no narration or simulated result.

`products.csv` and `products.json` were copied from files actually exported by that desktop run. All products are fictional, and product links point to example.com. No live Amazon requests were made.

To reproduce: load Scraper demo, set an existing workspace folder, and run. Six source rows across two pages become five unique products. Each run creates fresh timestamped CSV and JSON files. The recording and sample outputs follow the repository license.
