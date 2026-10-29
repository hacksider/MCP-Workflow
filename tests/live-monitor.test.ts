import { describe, it, expect } from "vitest";
import { parseCsv, safePreview } from "../src/LiveMonitor";
describe("live CSV display", () => {
  it("reads actual CSV escaping including quoted commas, quotes and newlines", () => {
    expect(
      parseCsv(
        '"title","note"\r\n"Desk, lamp","A ""quoted"" value"\r\n"Book","two\nlines"\r\n',
      ),
    ).toEqual([
      ["title", "note"],
      ["Desk, lamp", 'A "quoted" value'],
      ["Book", "two\nlines"],
    ]);
  });
  it("places restrictive preview policy before fetched HTML", () => {
    const html = safePreview(
      "<h1>Actual fixture</h1><script>example()</script>",
    );
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(
      html.indexOf("<h1>"),
    );
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("form-action 'none'");
  });
});
