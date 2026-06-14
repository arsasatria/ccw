import { test } from "node:test";
import assert from "node:assert/strict";
import { TerseModeTransformer } from "../terseMode.transformer";

test("enabled=true injects terse instruction at end of system", async () => {
  const t = new TerseModeTransformer({ enabled: true });
  const out = await t.transformRequestIn!(
    { system: [{ type: "text", text: "You are a helpful assistant." }] } as any,
    {} as any,
    {}
  );
  const sys = Array.isArray(out.system) ? out.system : [out.system];
  const last = sys[sys.length - 1];
  const text = typeof last === "string" ? last : last.text;
  assert.match(text, /terse/i);
  assert.match(text, /no preamble/i);
});

test("enabled=false (default) does not modify the system prompt", async () => {
  const t = new TerseModeTransformer();
  const input = { system: [{ type: "text", text: "You are a helpful assistant." }] } as any;
  const out = await t.transformRequestIn!(input, {} as any, {});
  assert.deepEqual(out, input);
});

test("appends to existing string system prompt", async () => {
  const t = new TerseModeTransformer({ enabled: true });
  const out = await t.transformRequestIn!(
    { system: "Be brief." } as any,
    {} as any,
    {}
  );
  const sys = Array.isArray(out.system) ? out.system[0] : out.system;
  assert.match(sys, /Be brief\./);
  assert.match(sys, /terse/i);
});

test("creates a system array if none exists", async () => {
  const t = new TerseModeTransformer({ enabled: true });
  const out = await t.transformRequestIn!({} as any, {} as any, {});
  assert.ok(Array.isArray(out.system));
  assert.equal(out.system.length, 1);
});
