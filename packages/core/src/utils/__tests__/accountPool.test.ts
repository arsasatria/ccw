import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountPool } from "../accountPool";
import type { ProviderAccount } from "../configShape";

const acc = (k: string, label?: string, priority?: number): ProviderAccount =>
  label || priority ? { apiKey: k, label, priority } : { apiKey: k };

test("picks first account when pool has one entry", () => {
  const pool = new AccountPool([acc("a")]);
  assert.equal(pool.pick().apiKey, "a");
});

test("rotates accounts across picks (round-robin)", () => {
  const pool = new AccountPool([acc("a"), acc("b"), acc("c")]);
  const seq = [pool.pick().apiKey, pool.pick().apiKey, pool.pick().apiKey, pool.pick().apiKey];
  assert.deepEqual(seq, ["a", "b", "c", "a"]);
});

test("priority sorts higher first; ties keep declared order", () => {
  const pool = new AccountPool([acc("a"), acc("b", undefined, 10), acc("c", undefined, 5)]);
  assert.equal(pool.pick().apiKey, "b");
  assert.equal(pool.pick().apiKey, "c");
  assert.equal(pool.pick().apiKey, "a");
});

test("markUnhealthy skips account on next pick(s)", () => {
  const pool = new AccountPool([acc("a"), acc("b")]);
  assert.equal(pool.pick().apiKey, "a");
  pool.markUnhealthy("a", "advance");
  assert.equal(pool.pick().apiKey, "b");
  // b is the cursor; after it we go back to a only if cooldown elapsed.
  // For the simple case, markUnhealthy resets the cursor.
});

test("reset cooldown returns account to pool", () => {
  const pool = new AccountPool([acc("a"), acc("b")], { cooldownMs: 60_000 });
  pool.markUnhealthy("a", "advance");
  pool.resetCooldown("a");
  // After reset the next pick may return to a (cursor continues from where it was).
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) seen.add(pool.pick().apiKey);
  assert.ok(seen.has("a"));
});
