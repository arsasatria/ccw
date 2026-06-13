import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatCard } from "../StatCard";

describe("StatCard", () => {
  it("renders the label and value", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Total requests" value={42} />
    );
    expect(html).toContain("Total requests");
    expect(html).toContain("42");
  });

  it("renders the footnote when provided", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Providers" value={3} footnote="across 2 regions" />
    );
    expect(html).toContain("Providers");
    expect(html).toContain("3");
    expect(html).toContain("across 2 regions");
  });

  it("omits the footnote node when not provided", () => {
    const html = renderToStaticMarkup(
      <StatCard label="Routes" value="0" />
    );
    expect(html).toContain("Routes");
    expect(html).toContain("0");
    // Footnote wrapper div shouldn't be rendered
    expect(html).not.toContain("italic");
  });
});
