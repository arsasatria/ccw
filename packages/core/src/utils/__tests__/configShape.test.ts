import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProvider, normalizeRouter } from "../configShape";

test("normalizeProvider wraps single apiKey into accounts[0]", () => {
  const out = normalizeProvider({ name: "openai", api_key: "k", models: ["m"] });
  assert.equal(out.accounts.length, 1);
  assert.equal(out.accounts[0].apiKey, "k");
  assert.equal(out.api_key, "k"); // legacy field still present
});

test("normalizeProvider keeps accounts[] when provided", () => {
  const out = normalizeProvider({
    name: "openai",
    accounts: [{ apiKey: "a" }, { apiKey: "b", label: "work", priority: 10 }],
    models: ["m"],
  });
  assert.equal(out.accounts.length, 2);
  assert.equal(out.accounts[1].label, "work");
  assert.equal(out.accounts[1].priority, 10);
});

test("normalizeRouter accepts both string and string[]", () => {
  const a = normalizeRouter({ default: "openai,gpt-4o" });
  assert.deepEqual(a.default, ["openai,gpt-4o"]);

  const b = normalizeRouter({ default: ["openai,gpt-4o", "groq,llama"] });
  assert.deepEqual(b.default, ["openai,gpt-4o", "groq,llama"]);
});
