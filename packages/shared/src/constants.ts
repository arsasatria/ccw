import path from "node:path";
import os from "node:os";
import { existsSync, cpSync } from "node:fs";

const NEW_HOME_DIR = path.join(os.homedir(), ".ccw");
const LEGACY_HOME_DIR = path.join(os.homedir(), ".ccw");

let _resolvedHomeDir: string | null = null;

function resolveHomeDir(): string {
  if (_resolvedHomeDir !== null) return _resolvedHomeDir;

  if (existsSync(NEW_HOME_DIR)) {
    _resolvedHomeDir = NEW_HOME_DIR;
  } else if (existsSync(LEGACY_HOME_DIR)) {
    try {
      cpSync(LEGACY_HOME_DIR, NEW_HOME_DIR, { recursive: true });
      _resolvedHomeDir = NEW_HOME_DIR;
      // eslint-disable-next-line no-console
      console.warn(
        `[ccw] Migrated config from ${LEGACY_HOME_DIR} to ${NEW_HOME_DIR}. ` +
          `The old directory can be deleted once you've verified everything still works.`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ccw] Could not migrate config to ${NEW_HOME_DIR}, falling back to ${LEGACY_HOME_DIR}: ${err}`
      );
      _resolvedHomeDir = LEGACY_HOME_DIR;
    }
  } else {
    _resolvedHomeDir = NEW_HOME_DIR;
  }
  return _resolvedHomeDir;
}

export const HOME_DIR = resolveHomeDir();

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PRESETS_DIR = path.join(HOME_DIR, "presets");

export const PID_FILE = path.join(HOME_DIR, ".ccw.pid");

export const LOG_FILE = path.join(HOME_DIR, "logs", "ccw.log");

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "ccw-reference-count.txt");

// Claude projects directory
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");


export interface DefaultConfig {
  LOG: boolean;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
}

export const DEFAULT_CONFIG: DefaultConfig = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
