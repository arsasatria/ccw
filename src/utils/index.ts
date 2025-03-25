import { HttpsProxyAgent } from "https-proxy-agent";
import OpenAI, { ClientOptions } from "openai";
import fs from "node:fs/promises";
import {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  HOME_DIR,
  PROMPTS_DIR,
} from "../constants";

export function getOpenAICommonOptions(): ClientOptions {
  const options: ClientOptions = {};
  if (process.env.PROXY_URL) {
    options.httpAgent = new HttpsProxyAgent(process.env.PROXY_URL);
  }
  return options;
}

const ensureDir = async (dir_path: string) => {
  try {
    await fs.access(dir_path);
  } catch {
    await fs.mkdir(dir_path, { recursive: true });
  }
};

export const initDir = async () => {
  await ensureDir(HOME_DIR);
  await ensureDir(PROMPTS_DIR);
};

export const readConfigFile = async () => {
  try {
    const config = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(config);
  } catch {
    await writeConfigFile(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
};

export const writeConfigFile = async (config: any) => {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};

export const initConfig = async () => {
  const config = await readConfigFile();
  Object.assign(process.env, config);
};

export const createClient = (options: ClientOptions) => {
  const client = new OpenAI({
    ...options,
    ...getOpenAICommonOptions(),
  });
  return client;
};
