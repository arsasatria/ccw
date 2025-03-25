import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".ccw");

export const CONFIG_FILE = `${HOME_DIR}/config.json`;

export const PROMPTS_DIR = `${HOME_DIR}/prompts`;

export const DEFAULT_CONFIG = {
  log: false,
  ENABLE_ROUTER: true,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
  OPENAI_MODEL: "openai/o3-mini",

  CODER_AGENT_API_KEY: "",
  CODER_AGENT_BASE_URL: "https://api.deepseek.com",
  CODER_AGENT_MODEL: "deepseek-chat",

  THINK_AGENT_API_KEY: "",
  THINK_AGENT_BASE_URL: "https://api.deepseek.com",
  THINK_AGENT_MODEL: "deepseek-reasoner",

  ROUTER_AGENT_API_KEY: "",
  ROUTER_AGENT_BASE_URL: "https://api.deepseek.com",
  ROUTER_AGENT_MODEL: "deepseek-chat",
};
