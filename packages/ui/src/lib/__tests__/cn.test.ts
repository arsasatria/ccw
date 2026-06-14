import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });
  it("deduplicates tailwind conflicts", () => {
    // tailwind-merge should keep the last one in conflicts
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
