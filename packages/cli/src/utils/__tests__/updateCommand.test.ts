/**
 * Tests for ccw update command.
 *
 * Verifies the install-path detection so the command finds the source dir
 * that the installer created. Run-from-source (no .git) and divergent
 * history are covered by code path, not unit tests — they require an actual
 * git checkout to exercise meaningfully.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";

test("detectCcwHome respects CCW_HOME env var (highest priority)", async () => {
  const { detectCcwHome } = await import("../updateCommand");
  const custom = "/tmp/custom-ccw-home-for-test";
  process.env.CCW_HOME = custom;
  try {
    assert.equal(detectCcwHome(), custom);
  } finally {
    delete process.env.CCW_HOME;
  }
});

test("detectCcwHome falls back to ~/.local/share/ccw on non-Windows when no env var", async () => {
  const { detectCcwHome } = await import("../updateCommand");
  if (process.platform === "win32") return; // windows branch is separate
  delete process.env.CCW_HOME;
  assert.equal(detectCcwHome(), join(homedir(), ".local", "share", "ccw"));
});

test("detectCcwHome uses %LOCALAPPDATA%\\Programs\\ccw on Windows when no env var", async () => {
  const { detectCcwHome } = await import("../updateCommand");
  if (process.platform !== "win32") return;
  const fakeLocal = "C:\\Users\\TestUser\\AppData\\Local";
  process.env.LOCALAPPDATA = fakeLocal;
  delete process.env.CCW_HOME;
  try {
    assert.equal(detectCcwHome(), join(fakeLocal, "Programs", "ccw"));
  } finally {
    delete process.env.LOCALAPPDATA;
  }
});
