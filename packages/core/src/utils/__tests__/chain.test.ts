import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChain } from "../chain";
import type { NormalizedProvider } from "../configShape";

const p = (name: string, models: string[], accounts: string[] = ["k"]): NormalizedProvider => ({
  name,
  models,
  accounts: accounts.map((apiKey) => ({ apiKey })),
  rotation: "error",
});

const cfg = (providers: NormalizedProvider[]) => ({ providers });

test("resolves single string entry into [{ provider, model }]", () => {
  const r = resolveChain(["openai,gpt-4o"], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 1);
  assert.equal(r[0].provider.name, "openai");
  assert.equal(r[0].model, "gpt-4o");
});

test("resolves multi-entry chain in order", () => {
  const r = resolveChain(
    ["openai,gpt-4o", "groq,llama-3.3-70b"],
    cfg([p("openai", ["gpt-4o"]), p("groq", ["llama-3.3-70b"])])
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].provider.name, "openai");
  assert.equal(r[1].provider.name, "groq");
});

test("drops entries whose provider or model is unknown", () => {
  const r = resolveChain(
    ["openai,gpt-4o", "unknown,m", "groq,llama-3.3-70b"],
    cfg([p("openai", ["gpt-4o"]), p("groq", ["llama-3.3-70b"])])
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].provider.name, "openai");
  assert.equal(r[1].provider.name, "groq");
});

test("resolves provider case-insensitively (legacy: 'OpenAI' -> 'openai')", () => {
  const r = resolveChain(["OpenAI,gpt-4o"], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 1);
  assert.equal(r[0].provider.name, "openai");
});

test("trims whitespace in entry", () => {
  const r = resolveChain([" openai , gpt-4o "], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 1);
});

test("empty input returns empty chain", () => {
  const r = resolveChain([], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 0);
});

test("all entries invalid returns empty chain (not throw)", () => {
  const r = resolveChain(["x,y", "a,b"], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 0);
});
