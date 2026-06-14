import { describe, expect, it } from "vitest";
import { coerceChain } from "../utils";

describe("coerceChain", () => {
  it("wraps a non-empty string into a single-element array", () => {
    expect(coerceChain("openai,gpt-4o")).toEqual(["openai,gpt-4o"]);
  });

  it("passes through a clean array of strings", () => {
    expect(coerceChain(["openai,gpt-4o", "groq,llama"])).toEqual([
      "openai,gpt-4o",
      "groq,llama",
    ]);
  });

  it("returns an empty array for null, undefined, or empty string", () => {
    expect(coerceChain(null)).toEqual([]);
    expect(coerceChain(undefined)).toEqual([]);
    expect(coerceChain("")).toEqual([]);
    expect(coerceChain("   ")).toEqual([]);
  });

  it("filters out empty and non-string entries from arrays", () => {
    expect(
      coerceChain(["a,b", "", "   ", 0, null, undefined, "c,d"])
    ).toEqual(["a,b", "c,d"]);
  });

  it("returns an empty array for non-string, non-array inputs", () => {
    expect(coerceChain(42)).toEqual([]);
    expect(coerceChain({})).toEqual([]);
    expect(coerceChain(true)).toEqual([]);
  });
});
