/**
 * Regression test for issue #1278:
 *   `ccw preset install` fails with ENOENT because saveManifest writes to
 *   `~/.claude-code-router/presets/<name>/manifest.json` without first
 *   creating the `<name>/` subdirectory on a fresh install.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fakeHome = mkdtempSync(join(tmpdir(), "ccw-shared-test-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

test("saveManifest creates the preset directory if it does not exist (issue #1278)", async () => {
  const { saveManifest } = await import("../install");
  const presetName = "fresh-install-no-mkdir";
  const manifest = {
    name: presetName,
    version: "1.0.0",
    metadata: { name: presetName, version: "1.0.0" },
    Providers: [],
  };

  // HOME_DIR in this project resolves to <homedir>/.ccw — not just homedir.
  const presetDir = join(fakeHome, ".ccw", "presets", presetName);
  assert.equal(existsSync(presetDir), false, "preset dir must not pre-exist");

  await saveManifest(presetName, manifest);

  assert.equal(existsSync(presetDir), true, "preset dir must be created");
  const written = JSON.parse(
    readFileSync(join(presetDir, "manifest.json"), "utf-8"),
  );
  assert.deepEqual(written, manifest);
});

test("saveManifest is idempotent when the preset directory already exists", async () => {
  const { saveManifest } = await import("../install");
  const presetName = "existing-preset";
  const manifest = {
    name: presetName,
    version: "2.0.0",
    metadata: { name: presetName, version: "2.0.0" },
  };

  await saveManifest(presetName, manifest);
  await saveManifest(presetName, manifest);

  const presetDir = join(fakeHome, ".ccw", "presets", presetName);
  const written = JSON.parse(
    readFileSync(join(presetDir, "manifest.json"), "utf-8"),
  );
  assert.deepEqual(written, manifest);
});

test.after(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});
