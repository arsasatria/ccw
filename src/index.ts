import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { initConfig, initDir } from "./utils";
import { createServer } from "./server";
import { rewriteToolsPrompt } from "./middlewares/rewriteToolsPrompt";

async function initializeClaudeConfig() {
  const homeDir = process.env.HOME;
  const configPath = `${homeDir}/.claude.json`;
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "0.2.9",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

async function run() {
  await initializeClaudeConfig();
  await initDir();
  await initConfig();
  const server = createServer(3456);
  server.useMiddleware(rewriteToolsPrompt);
  server.start();
}
run();
