import { test } from "node:test";
import assert from "node:assert/strict";
import { walkChain } from "../chainWalker";
import { resolveChain } from "../chain";
import { AccountPool } from "../accountPool";
import type { NormalizedProvider } from "../configShape";

const p = (name: string, models: string[], accounts: string[] = ["k"]): NormalizedProvider => ({
  name,
  models,
  accounts: accounts.map((apiKey) => ({ apiKey })),
  rotation: "error",
});

test("first entry succeeds — others not tried", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(["openai,gpt-4o", "groq,llama"], {
      providers: [p("openai", ["gpt-4o"]), p("groq", ["llama"])],
    }),
    newPool: () => new AccountPool([{ apiKey: "k" }]),
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(entry.provider.name);
      return { ok: true, value: "ok" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal((result as any).value, "ok");
  assert.deepEqual(calls, ["openai"]);
});

test("first entry fails (advance) — moves to second entry", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(["openai,gpt-4o", "groq,llama"], {
      providers: [p("openai", ["gpt-4o"]), p("groq", ["llama"])],
    }),
    newPool: () => new AccountPool([{ apiKey: "k" }]),
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(entry.provider.name);
      if (entry.provider.name === "openai") return { ok: false, error: { status: 429 } };
      return { ok: true, value: "groq-ok" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal((result as any).value, "groq-ok");
  assert.deepEqual(calls, ["openai", "groq"]);
});

test("first entry fails (stop) — does NOT try second entry", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(["openai,gpt-4o", "groq,llama"], {
      providers: [p("openai", ["gpt-4o"]), p("groq", ["llama"])],
    }),
    newPool: () => new AccountPool([{ apiKey: "k" }]),
    classifyError: () => "stop",
    exec: async (entry) => {
      calls.push(entry.provider.name);
      return { ok: false, error: { status: 400, body: "missing field" } };
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["openai"]);
});

test("first entry has 2 accounts, both fail (advance) — moves to second entry", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(
      ["openai,gpt-4o", "groq,llama"],
      {
        providers: [
          p("openai", ["gpt-4o"], ["k1", "k2"]),
          p("groq", ["llama"]),
        ],
      }
    ),
    newPool: (accounts) => new AccountPool(accounts),
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(`${entry.provider.name}#${entry.account.apiKey}`);
      return { ok: false, error: { status: 429 } };
    },
  });
  assert.equal(result.ok, false);
  // openai#k1, openai#k2, then groq#k, then both entries exhausted.
  assert.equal(calls.length, 3);
  assert.equal(calls[0], "openai#k1");
  assert.equal(calls[1], "openai#k2");
  assert.equal(calls[2], "groq#k");
});

test("unhealthy account is marked, picked over on retry", async () => {
  const pool = new AccountPool([{ apiKey: "k1" }, { apiKey: "k2" }]);
  const calls: string[] = [];
  await walkChain({
    chain: resolveChain(["openai,gpt-4o"], {
      providers: [p("openai", ["gpt-4o"], ["k1", "k2"])],
    }),
    newPool: () => pool,
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(entry.account.apiKey);
      return { ok: false, error: { status: 429 } };
    },
  });
  // After both accounts are tried, k1 and k2 are both marked unhealthy.
  assert.equal(calls[0], "k1");
  assert.equal(calls[1], "k2");
});
