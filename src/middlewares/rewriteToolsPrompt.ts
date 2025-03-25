import { Request, Response, NextFunction } from "express";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { PROMPTS_DIR } from "../constants";

const getPrompt = async (name: string) => {
  try {
    const promptPath = join(PROMPTS_DIR, `${name}.md`);
    await access(promptPath);
    const prompt = await readFile(promptPath, "utf-8");
    return prompt;
  } catch {
    return null;
  }
};

export const rewriteToolsPrompt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { tools } = req.body;
  if (!Array.isArray(tools)) {
    next();
    return;
  }
  for (const tool of tools) {
    const prompt = await getPrompt(tool.name);
    if (prompt) {
      tool.description = prompt;
    }
  }
  next();
};
