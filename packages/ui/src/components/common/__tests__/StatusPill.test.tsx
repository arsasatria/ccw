import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusPill } from "../StatusPill";

describe("StatusPill", () => {
  it("renders the label", () => {
    const html = renderToStaticMarkup(
      <StatusPill status="online" label="Gateway running" />
    );
    expect(html).toContain("Gateway running");
  });

  it("applies the success dot class for online status", () => {
    const html = renderToStaticMarkup(
      <StatusPill status="online" label="active" />
    );
    expect(html).toContain("bg-success");
  });

  it("applies the danger dot class for danger status", () => {
    const html = renderToStaticMarkup(
      <StatusPill status="danger" label="offline" />
    );
    expect(html).toContain("bg-danger");
  });

  it("applies the ink-subtle dot class for offline status", () => {
    const html = renderToStaticMarkup(
      <StatusPill status="offline" label="idle" />
    );
    expect(html).toContain("bg-ink-subtle");
  });
});
