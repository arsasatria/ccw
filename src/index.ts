import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { getOpenAICommonOptions, initConfig, initDir } from "./utils";
import { createServer } from "./server";
import { formatRequest } from "./middlewares/formatRequest";
import { rewriteBody } from "./middlewares/rewriteBody";
import OpenAI from "openai";
import { streamOpenAIResponse } from "./utils/stream";

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
  server.useMiddleware(formatRequest);
  server.useMiddleware(rewriteBody);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    ...getOpenAICommonOptions(),
  });
  server.app.post("/v1/messages", async (req, res) => {
    try {
      if (process.env.OPENAI_MODEL) {
        req.body.model = process.env.OPENAI_MODEL;
      }
      const completion: any = await openai.chat.completions.create(req.body);
      await streamOpenAIResponse(res, completion, req.body.model);
    } catch (e) {
      console.error("Error in OpenAI API call:", e);
    }
  });
  server.start();
}
run();
