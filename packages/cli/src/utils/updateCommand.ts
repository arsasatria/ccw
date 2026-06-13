import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { version } from "../../package.json";

const REPO_URL = "https://github.com/arsasatria/ccw.git";
const BRANCH = "main";

export const detectCcwHome = (): string => {
  if (process.env.CCW_HOME) return process.env.CCW_HOME;
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (local) return join(local, "Programs", "ccw");
  }
  return join(homedir(), ".local", "share", "ccw");
};

const getCurrentCommit = (dest: string): string | null => {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: dest,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const getRemoteCommit = (dest: string): string | null => {
  try {
    execSync(`git fetch --depth 1 origin ${BRANCH}`, {
      cwd: dest,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return execSync(`git rev-parse --short origin/${BRANCH}`, {
      cwd: dest,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const runStep = (label: string, cmd: string, cwd: string): boolean => {
  process.stderr.write(`  [..]   ${label}\n`);
  try {
    execSync(cmd, { cwd, stdio: "inherit" });
    process.stderr.write(`  [ok]   ${label}\n`);
    return true;
  } catch (e: any) {
    process.stderr.write(`  [fail] ${label} (exit ${e?.status ?? "?"})\n`);
    return false;
  }
};

export const runUpdate = async (): Promise<void> => {
  const dest = detectCcwHome();
  const startedAt = Date.now();

  process.stderr.write("\n");
  process.stderr.write("+---------------------------------------------------+\n");
  process.stderr.write("|             ccw self-update                        |\n");
  process.stderr.write("+---------------------------------------------------+\n");
  process.stderr.write(`\n  Current version: ${version}\n`);
  process.stderr.write(`  Install path:    ${dest}\n\n`);

  if (!existsSync(join(dest, ".git"))) {
    process.stderr.write(
      `  [..]   No git checkout at ${dest} — cannot self-update.\n`,
    );
    process.stderr.write(
      `         Re-run the installer to pick up newer versions:\n`,
    );
    process.stderr.write(
      `           curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash\n\n`,
    );
    process.exit(1);
  }

  const before = getCurrentCommit(dest);
  if (before) {
    process.stderr.write(`  [..]   Local commit:  ${before}\n`);
  }
  const remote = getRemoteCommit(dest);
  if (remote) {
    process.stderr.write(`  [..]   Remote commit: ${remote}\n`);
  }

  if (before && remote && before === remote) {
    process.stderr.write(
      `\n  Already up to date (commit ${before}). Nothing to do.\n\n`,
    );
    return;
  }

  process.stderr.write(`\n  Updating source:\n`);
  const ffOk = runStep(
    "git pull --ff-only",
    `git pull --ff-only origin ${BRANCH}`,
    dest,
  );
  if (!ffOk) {
    // Fast-forward failed. The installer uses `git clone --depth 1`, so
    // when origin has moved past a commit the shallow history can't see,
    // ff-only refuses ("diverged"). Telling the user to re-run the
    // installer is heavy: it re-clones the whole repo and re-runs
    // pnpm install. A fetch + hard-reset does the same job in seconds
    // and reuses the existing node_modules / build cache.
    process.stderr.write(
      `\n  Fast-forward pull failed (shallow clone can't follow origin's history).\n` +
        `  Falling back to fetch + reset to origin/${BRANCH}.\n` +
        `  Local commits in the install dir will be lost — this is fine for\n` +
        `  a managed install, but if you've been editing ccw source here,\n` +
        `  back them up first.\n\n`,
    );
    const fetchOk = runStep(
      `git fetch --depth 1 origin ${BRANCH}`,
      `git fetch --depth 1 origin ${BRANCH}`,
      dest,
    );
    if (!fetchOk) {
      process.stderr.write(
        `\n  Fetch failed. As a last resort, re-run the installer:\n` +
          `    curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash\n\n`,
      );
      process.exit(1);
    }
    const resetOk = runStep(
      `git reset --hard origin/${BRANCH}`,
      `git reset --hard origin/${BRANCH}`,
      dest,
    );
    if (!resetOk) {
      process.stderr.write(
        `\n  Reset failed — most likely uncommitted local changes are blocking it.\n` +
          `  Either stash/discard them and re-run \`ccw update\`, or re-run the installer:\n` +
          `    curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash\n\n`,
      );
      process.exit(1);
    }
  }

  process.stderr.write(`\n  Rebuilding:\n`);
  if (!runStep("pnpm install --frozen-lockfile", "pnpm install --frozen-lockfile", dest)) {
    process.stderr.write(`\n  pnpm install failed. Aborting update.\n\n`);
    process.exit(1);
  }
  if (!runStep("pnpm build", "pnpm build", dest)) {
    process.stderr.write(`\n  pnpm build failed. Aborting update.\n\n`);
    process.exit(1);
  }

  const after = getCurrentCommit(dest);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(
    `\n  Updated: ${before ?? "?"} -> ${after ?? "?"} in ${elapsed}s\n\n`,
  );

  process.stderr.write(`  Restarting service (if running):\n`);
  const cliPath = join(dest, "packages", "cli", "dist", "cli.js");
  if (existsSync(cliPath)) {
    try {
      const child = spawn("node", [cliPath, "restart"], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {
        process.stderr.write(`         (service not running, skipped)\n\n`);
      });
      child.unref();
      process.stderr.write(`         service restart triggered\n\n`);
    } catch {
      process.stderr.write(`         (service not running, skipped)\n\n`);
    }
  }
};
