import { describe, expect, it } from "vitest";
import { normalizeAccounts } from "../utils";

describe("normalizeAccounts", () => {
  it("collapses a single matching account back to the legacy key shape", () => {
    const result = normalizeAccounts({
      api_key: "sk-legacy",
      accounts: [{ apiKey: "sk-legacy" }],
      rotation: "quota",
    });
    expect(result).toEqual({ api_key: "sk-legacy" });
  });

  it("collapses a single account even when legacy is empty (trimmed)", () => {
    const result = normalizeAccounts({
      api_key: "",
      accounts: [{ apiKey: "  sk-only  " }],
    });
    expect(result).toEqual({ api_key: "sk-only" });
  });

  it("clears the legacy key when 2+ accounts remain", () => {
    const result = normalizeAccounts({
      api_key: "sk-legacy",
      accounts: [{ apiKey: "sk-a" }, { apiKey: "sk-b" }],
    });
    expect(result).toEqual({
      api_key: "",
      accounts: [{ apiKey: "sk-a" }, { apiKey: "sk-b" }],
      rotation: "error",
    });
  });

  it("preserves the rotation choice when the pool is kept", () => {
    const result = normalizeAccounts({
      api_key: "",
      accounts: [{ apiKey: "sk-a" }, { apiKey: "sk-b" }],
      rotation: "quota",
    });
    expect(result.rotation).toBe("quota");
  });

  it("defaults rotation to 'error' when 2+ accounts but no rotation set", () => {
    const result = normalizeAccounts({
      api_key: "",
      accounts: [{ apiKey: "sk-a" }, { apiKey: "sk-b" }],
    });
    expect(result.rotation).toBe("error");
  });

  it("trims whitespace and drops empty apiKey entries", () => {
    const result = normalizeAccounts({
      api_key: "sk-legacy",
      accounts: [
        { apiKey: "  sk-a  " },
        { apiKey: "" },
        { apiKey: "   " },
        { apiKey: "sk-b" },
      ],
    });
    // 2 valid accounts -> keep the pool, clear legacy.
    expect(result.api_key).toBe("");
    expect(result.accounts).toEqual([
      { apiKey: "sk-a" },
      { apiKey: "sk-b" },
    ]);
  });

  it("returns an empty result when all accounts are empty after trimming", () => {
    const result = normalizeAccounts({
      api_key: "sk-legacy",
      accounts: [{ apiKey: "" }, { apiKey: "  " }],
    });
    expect(result).toEqual({ api_key: "sk-legacy" });
  });

  it("preserves non-empty labels on kept accounts", () => {
    const result = normalizeAccounts({
      api_key: "",
      accounts: [
        { apiKey: "sk-a", label: "personal" },
        { apiKey: "sk-b", label: "" },
      ],
    });
    expect(result.accounts).toEqual([
      { apiKey: "sk-a", label: "personal" },
      { apiKey: "sk-b" },
    ]);
  });
});
