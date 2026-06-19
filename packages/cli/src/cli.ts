#!/usr/bin/env node
import { run, restartService } from "./utils";
import { showStatus } from "./utils/status";
import { executeCodeCommand, PresetConfig } from "./utils/codeCommand";
import {
  cleanupPidFile,
  isServiceRunning,
  getServiceInfo,
} from "./utils/processCheck";
import { runModelSelector } from "./utils/modelSelector";
import { activateCommand } from "./utils/activateCommand";
import { readConfigFile } from "./utils";
import { version } from "../package.json";
import { spawn, exec } from "child_process";
import {getPresetDir, loadConfigFromManifest, HOME_DIR, PID_FILE, readPresetFile, REFERENCE_COUNT_FILE} from "@ccw/shared";
import fs, { existsSync, readFileSync, openSync } from "fs";
import { join } from "path";
import { parseStatusLineData, StatusLineInput } from "./utils/statusline";
import {handlePresetCommand} from "./utils/preset";
import { handleInstallCommand } from "./utils/installCommand";
import { runUpdate } from "./utils/updateCommand";
import { createConnection } from "net";


const command = process.argv[2];

// Define all known commands
const KNOWN_COMMANDS = [
  "start",
  "stop",
  "restart",
  "status",
  "statusline",
  "code",
  "model",
  "preset",
  "install",
  "activate",
  "env",
  "ui",
  "update",
  "-v",
  "version",
  "--version",
  "-h",
  "help",
  "--help",
];

const HELP_TEXT = `
CCW — Claude Code Wrapper
https://github.com/arsasatria/ccw

Usage: ccw [command] [preset-name]

Commands:
  start         Start server
  stop          Stop server
  restart       Restart server
  status        Show server status
  statusline    Integrated statusline
  code          Execute claude command
  model         Interactive model selection and configuration
  preset        Manage presets (export, install, list, delete)
  install       Install preset from GitHub marketplace
  activate      Output environment variables for shell integration
  ui            Open the web UI in browser
  update        Pull latest source from GitHub, rebuild, and restart service
  -v, version, --version   Show version information
  -h, help, --help         Show help information

Presets:
  Any preset directory in ~/.ccw/presets/

Examples:
  ccw start
  ccw code "Write a Hello World"
  ccw my-preset "Write a Hello World"    # Use preset configuration
  ccw model
  ccw preset export my-config            # Export current config as preset
  ccw preset install /path/to/preset     # Install a preset from directory
  ccw preset list                        # List all presets
  ccw install my-preset                  # Install preset from marketplace
  eval "$(ccw activate)"  # Set environment variables globally
  ccw ui
`;

// Opens a per-spawn log file under ~/.ccw/logs/ and returns the fd + path
// so the auto-spawned `ccw start` writes its stdout/stderr somewhere the
// user can inspect when startup times out. The pino logger already writes
// server errors to the same directory, but a separate per-attempt log
// makes it easy to grep "what did the last spawn print?".
function openStartupLog(): { fd: number; path: string } {
  const logDir = join(HOME_DIR, "logs");
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // best effort
  }
  const path = join(
    logDir,
    `ccw-startup-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.log`
  );
  const fd = openSync(path, "a");
  return { fd, path };
}

async function isPortListening(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

// Stronger liveness check than the sync isServiceRunning(): also accepts
// the port being open, which catches the case where the service is up
// under a different PID (e.g. the user started it manually outside of
// ccw, or a previous detached process survived but the PID file is stale
// or points at a recycled PID).
async function isServiceAliveAsync(): Promise<boolean> {
  if (isServiceRunning()) return true;
  try {
    const config = await readConfigFile();
    const port = config.PORT || 3456;
    return await isPortListening(port);
  } catch {
    return false;
  }
}

async function waitForService(
  timeout = 30000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  let lastProgress = 0;
  while (Date.now() - startTime < timeout) {
    if (await isServiceAliveAsync()) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    // Emit a heartbeat every 5s so the user knows we're still polling,
    // not hung — the previous 10s ceiling could be eaten silently by
    // getServer()'s transformer/plugin load on first run.
    const elapsed = Date.now() - startTime;
    if (elapsed - lastProgress >= 5000) {
      lastProgress = elapsed;
      process.stderr.write(
        `         still waiting... (${(elapsed / 1000).toFixed(0)}s/${(timeout / 1000).toFixed(0)}s)\n`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  const isRunning = isServiceRunning()

  // If command is not a known command, check if it's a preset
  if (command && !KNOWN_COMMANDS.includes(command)) {
    const manifest = await readPresetFile(command);

    if (manifest) {
      // This is a preset, load its configuration
      const presetDir = getPresetDir(command);
      const config = loadConfigFromManifest(manifest, presetDir);

      // Execute code command
      const codeArgs = process.argv.slice(3); // Get remaining arguments

      // Check noServer configuration
      const shouldStartServer = config.noServer !== true;

      // Build environment variable overrides
      let envOverrides: Record<string, string> = {};

      // Handle provider configuration (supports both old and new formats)
      let provider: any = null;

      // Old format: config.provider is the provider name
      if (config.provider && typeof config.provider === 'string') {
        const globalConfig = await readConfigFile();
        provider = globalConfig.Providers?.find((p: any) => p.name === config.provider);
      }
      // New format: config.Providers is an array of providers
      else if (config.Providers && config.Providers.length > 0) {
        provider = config.Providers[0];
      }

      // If noServer is not true, use local server baseurl
      if (shouldStartServer) {
        const globalConfig = await readConfigFile();
        const port = globalConfig.PORT || 3456;
        envOverrides = {
          ...envOverrides,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}/preset/${command}`,
        };
      } else if (provider) {
        // Handle api_base_url, remove /v1/messages suffix
        if (provider.api_base_url) {
          let baseUrl = provider.api_base_url;
          if (baseUrl.endsWith('/v1/messages')) {
            baseUrl = baseUrl.slice(0, -'/v1/messages'.length);
          } else if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
          }
          envOverrides = {
            ...envOverrides,
            ANTHROPIC_BASE_URL: baseUrl,
          };
        }

        // Handle api_key
        if (provider.api_key) {
          envOverrides = {
            ...envOverrides,
            ANTHROPIC_AUTH_TOKEN: provider.api_key,
          };
        }
      }

      // Build PresetConfig
      const presetConfig: PresetConfig = {
        noServer: config.noServer,
        claudeCodeSettings: config.claudeCodeSettings,
        StatusLine: config.StatusLine
      };

      if (shouldStartServer && !isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const { fd: logFd, path: logPath } = openStartupLog();
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: ["ignore", logFd, logFd],
        });
        // The child inherited a dup of logFd. Close the parent's copy so
        // we don't leak the fd for the lifetime of the parent process.
        try { fs.closeSync(logFd); } catch {}
        process.stderr.write(`         startup log: ${logPath}\n`);

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService()) {
          executeCodeCommand(codeArgs, presetConfig, envOverrides, command);
        } else {
          console.error(
            "Service startup timeout. To see why, run `ccw start` directly " +
            "(errors are written to ~/.ccw/logs/). " +
            "Common causes: another process is bound to the configured PORT, " +
            "or a plugin/transformer threw during init."
          );
          process.exit(1);
        }
      } else {
        // Service is already running or no need to start server
        if (shouldStartServer && !isRunning) {
          console.error("Service is not running. Please start it first with `ccw start`");
          process.exit(1);
        }
        executeCodeCommand(codeArgs, presetConfig, envOverrides, command);
      }
      return;
    } else {
      // Not a preset nor a known command
      console.log(HELP_TEXT);
      process.exit(1);
    }
  }

  switch (command) {
    case "start":
      await run();
      break;
    case "stop":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "Claude Code Wrapper service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        cleanupPidFile();
      }
      break;
    case "status":
      await showStatus();
      break;
    case "statusline":
      // Read JSON input from stdin
      let inputData = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("readable", () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
          inputData += chunk;
        }
      });

      process.stdin.on("end", async () => {
        try {
          const input: StatusLineInput = JSON.parse(inputData);
          // Check if preset name is provided as argument
          const presetName = process.argv[3];
          const statusLine = await parseStatusLineData(input, presetName);
          console.log(statusLine);
        } catch (error) {
          console.error("Error parsing status line data:", error);
          process.exit(1);
        }
      });
      break;
    // ADD THIS CASE
    case "model":
      await runModelSelector();
      break;
    case "preset":
      await handlePresetCommand(process.argv.slice(3));
      break;
    case "install":
      const presetName = process.argv[3];
      await handleInstallCommand(presetName);
      break;
    case "activate":
    case "env":
      await activateCommand();
      break;
    case "code":
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const { fd: logFd, path: logPath } = openStartupLog();
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: ["ignore", logFd, logFd],
        });
        // The child inherited a dup of logFd. Close the parent's copy so
        // we don't leak the fd for the lifetime of the parent process.
        try { fs.closeSync(logFd); } catch {}
        process.stderr.write(`         startup log: ${logPath}\n`);

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService()) {
          const codeArgs = process.argv.slice(3);
          executeCodeCommand(codeArgs);
        } else {
          console.error(
            "Service startup timeout. To see why, run `ccw start` directly " +
            "(errors are written to ~/.ccw/logs/). " +
            "Common causes: another process is bound to the configured PORT, " +
            "or a plugin/transformer threw during init."
          );
          process.exit(1);
        }
      } else {
        const codeArgs = process.argv.slice(3);
        executeCodeCommand(codeArgs);
      }
      break;
    case "ui":
      // Check if service is running
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const { fd: logFd, path: logPath } = openStartupLog();
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: ["ignore", logFd, logFd],
        });
        // The child inherited a dup of logFd. Close the parent's copy so
        // we don't leak the fd for the lifetime of the parent process.
        try { fs.closeSync(logFd); } catch {}
        process.stderr.write(`         startup log: ${logPath}\n`);

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (!(await waitForService())) {
          // If service startup fails, try to start with default config
          console.log(
            "Service startup timeout, trying to start with default configuration..."
          );
          const {
            initDir,
            writeConfigFile,
            backupConfigFile,
          } = require("./utils");

          try {
            // Initialize directories
            await initDir();

            // Backup existing config file if it exists
            const backupPath = await backupConfigFile();
            if (backupPath) {
              console.log(
                `Backed up existing configuration file to ${backupPath}`
              );
            }

            // Create a minimal default config file
            await writeConfigFile({
              PORT: 3456,
              Providers: [],
              Router: {},
            });
            console.log(
              "Created minimal default configuration file at ~/.ccw/config.json"
            );
            console.log(
              "Please edit this file with your actual configuration."
            );

            // Try starting the service again
            const { fd: logFd, path: logPath } = openStartupLog();
            const restartProcess = spawn("node", [cliPath, "start"], {
              detached: true,
              stdio: ["ignore", logFd, logFd],
            });
            // The child inherited a dup of logFd. Close the parent's copy so
            // we don't leak the fd for the lifetime of the parent process.
            try { fs.closeSync(logFd); } catch {}
            process.stderr.write(`         startup log: ${logPath}\n`);

            restartProcess.on("error", (error) => {
              console.error(
                "Failed to start service with default config:",
                error.message
              );
              process.exit(1);
            });

            restartProcess.unref();

            if (!(await waitForService(15000))) {
              // Wait a bit longer for the first start
              console.error(
                "Service startup still failing. Please manually run `ccw start` to start the service and check the logs."
              );
              process.exit(1);
            }
          } catch (error: any) {
            console.error(
              "Failed to create default configuration:",
              error.message
            );
            process.exit(1);
          }
        }
      }

      // Get service info and open UI
      const serviceInfo = await getServiceInfo();

      // Add temporary API key as URL parameter if successfully generated
      const uiUrl = `${serviceInfo.endpoint}/ui/`;

      console.log(`Opening UI at ${uiUrl}`);

      // Open URL in browser based on platform
      const platform = process.platform;
      let openCommand = "";

      if (platform === "win32") {
        // Windows
        openCommand = `start ${uiUrl}`;
      } else if (platform === "darwin") {
        // macOS
        openCommand = `open ${uiUrl}`;
      } else if (platform === "linux") {
        // Linux
        openCommand = `xdg-open ${uiUrl}`;
      } else {
        console.error("Unsupported platform for opening browser");
        process.exit(1);
      }

      exec(openCommand, (error) => {
        if (error) {
          console.error("Failed to open browser:", error.message);
          process.exit(1);
        }
      });
      break;
    case "-v":
    case "version":
    case "--version":
      console.log(`CCW v${version} (Claude Code Wrapper)`);
      break;
    case "restart":
      await restartService();
      break;
    case "update":
      await runUpdate();
      break;
    case "-h":
    case "help":
    case "--help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
