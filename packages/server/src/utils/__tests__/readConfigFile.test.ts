/**
 * Regression test for issue #1373:
 *   The Web UI's GET /api/config used to resolve env-var references like
 *   `${OPENAI_API_KEY}` to their literal values. The UI then saved back
 *   the resolved value, overwriting the env-var reference. After that the
 *   user could no longer rotate keys via env vars without editing the file.
 *
 *   The fix: readConfigFile now accepts `{ interpolate: false }` so the UI
 *   route can return the raw config, preserving ${VAR} syntax verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fakeHome = mkdtempSync(join(tmpdir(), "ccw-server-test-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;
mkdirSync(join(fakeHome, ".ccw"), { recursive: true });

// Set the env var so the literal would differ from the reference.
process.env.MY_TEST_KEY = "sk-real-key-from-env-1234";

test("readConfigFile preserves ${VAR} references when interpolate:false (issue #1373)", async () => {
  const { readConfigFile } = await import("../index");
  const { CONFIG_FILE } = await import("@ccw/shared");

  // Write a config that uses env-var references
  const rawConfig = `{
  Providers: [
    {
      name: "openai",
      api_key: "\${MY_TEST_KEY}",
      api_base_url: "https://api.openai.com/v1",
      models: ["gpt-4o"]
    }
  ],
  Router: { default: "openai,gpt-4o" }
}`;
  writeFileSync(CONFIG_FILE, rawConfig, "utf-8");

  // With interpolate:false, the raw env-var reference must be preserved
  const raw = (await readConfigFile({ interpolate: false })) as any;
  assert.equal(
    raw.Providers[0].api_key,
    "${MY_TEST_KEY}",
    "raw ${VAR} reference must be preserved when interpolate:false",
  );

  // With default (interpolate:true), the reference should be resolved
  const resolved = (await readConfigFile()) as any;
  assert.equal(
    resolved.Providers[0].api_key,
    "sk-real-key-from-env-1234",
    "interpolate:true must resolve ${VAR} to the env value",
  );
});

test.after(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});
