import { describe, expect, it } from "vitest";
import { swatchFor, SWATCHES } from "../palette";

describe("swatchFor", () => {
  it("returns a swatch from the palette", () => {
    const s = swatchFor("anthropic");
    expect(SWATCHES).toContain(s);
  });
  it("is deterministic for the same seed", () => {
    expect(swatchFor("openai").name).toBe(swatchFor("openai").name);
  });
  it("varies across different seeds (statistical)", () => {
    const names = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(swatchFor).map((s) => s.name)
    );
    expect(names.size).toBeGreaterThan(2);
  });
});
