import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountPool } from "../accountPool";
import type { ProviderAccount } from "../configShape";

const acc = (k: string, label?: string, priority?: number): ProviderAccount =>
  label || priority ? { apiKey: k, label, priority } : { apiKey: k };

test("picks first account when pool has one entry", () => {
  const pool = new AccountPool([acc("a")]);
  const account = pool.pick();
  assert.ok(account, "pick() should return a healthy account");
  assert.equal(account!.apiKey, "a");
});

test("rotates accounts across picks (round-robin)", () => {
  const pool = new AccountPool([acc("a"), acc("b"), acc("c")]);
  const picks = [pool.pick(), pool.pick(), pool.pick(), pool.pick()];
  for (const p of picks) {
    assert.ok(p, "pick() should return a healthy account");
  }
  const seq = picks.map((p) => p!.apiKey);
  assert.deepEqual(seq, ["a", "b", "c", "a"]);
});

test("priority sorts higher first; ties keep declared order", () => {
  const pool = new AccountPool([acc("a"), acc("b", undefined, 10), acc("c", undefined, 5)]);
  const first = pool.pick();
  const second = pool.pick();
  const third = pool.pick();
  assert.ok(first, "first pick() should return a healthy account");
  assert.ok(second, "second pick() should return a healthy account");
  assert.ok(third, "third pick() should return a healthy account");
  assert.equal(first!.apiKey, "b");
  assert.equal(second!.apiKey, "c");
  assert.equal(third!.apiKey, "a");
});

test("markUnhealthy skips account on next pick(s)", () => {
  const pool = new AccountPool([acc("a"), acc("b")]);
  const first = pool.pick();
  assert.ok(first, "first pick() should return a healthy account");
  assert.equal(first!.apiKey, "a");
  pool.markUnhealthy("a", "advance");
  const second = pool.pick();
  assert.ok(second, "second pick() should return a healthy account");
  assert.equal(second!.apiKey, "b");
  // b is the cursor; after it we go back to a only if cooldown elapsed.
  // For the simple case, markUnhealthy resets the cursor.
});

test("reset cooldown returns account to pool", () => {
  const pool = new AccountPool([acc("a"), acc("b")], { cooldownMs: 60_000 });
  pool.markUnhealthy("a", "advance");
  pool.resetCooldown("a");
  // After reset the next pick may return to a (cursor continues from where it was).
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const picked = pool.pick();
    assert.ok(picked, "pick() should return a healthy account");
    seen.add(picked!.apiKey);
  }
  assert.ok(seen.has("a"));
});
