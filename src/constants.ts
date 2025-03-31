import path from "node:path";
import os from "node:os";

export const HOME_DIR = path.join(os.homedir(), ".ccw");

export const CONFIG_FILE = `${HOME_DIR}/config.json`;

export const PLUGINS_DIR = `${HOME_DIR}/plugins`;

export const DEFAULT_CONFIG = {
  log: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
  OPENAI_MODEL: "openai/o3-mini",
};
