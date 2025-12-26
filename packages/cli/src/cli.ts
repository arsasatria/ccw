#!/usr/bin/env node
import { run } from "./utils";
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
import { PID_FILE, REFERENCE_COUNT_FILE } from "@ccw/shared";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseStatusLineData, StatusLineInput } from "./utils/statusline";

const command = process.argv[2];

// 定义所有已知命令
const KNOWN_COMMANDS = [
  "start",
  "stop",
  "restart",
  "status",
  "statusline",
  "code",
  "model",
  "activate",
  "env",
  "ui",
  "-v",
  "version",
  "-h",
  "help",
];

const HELP_TEXT = `
Usage: ccr [command] [preset-name]

Commands:
  start         Start server
  stop          Stop server
  restart       Restart server
  status        Show server status
  statusline    Integrated statusline
  code          Execute claude command
  model         Interactive model selection and configuration
  activate      Output environment variables for shell integration
  ui            Open the web UI in browser
  -v, version   Show version information
  -h, help      Show help information

Presets:
  Any preset-name defined in ~/.ccw/presets/*.ccrsets

Examples:
  ccr start
  ccr code "Write a Hello World"
  ccr my-preset "Write a Hello World"    # Use preset configuration
  ccr model
  eval "$(ccr activate)"  # Set environment variables globally
  ccr ui
`;

async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const isRunning = await isServiceRunning()
    if (isRunning) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  const isRunning = await isServiceRunning()

  // 如果命令不是已知命令，检查是否是 preset
  if (command && !KNOWN_COMMANDS.includes(command)) {
    const { readPresetFile } = await import("./utils");
    const presetConfig: PresetConfig | null = await readPresetFile(command);

    if (presetConfig) {
      // 这是一个 preset，执行 code 命令
      const codeArgs = process.argv.slice(3); // 获取剩余参数

      // 检查 noServer 配置
      const shouldStartServer = presetConfig.noServer !== true;

      // 处理 provider 配置，构建环境变量覆盖
      let envOverrides: Record<string, string> | undefined;
      if (presetConfig.provider) {
        const config = await readConfigFile();
        const providerName = presetConfig.provider;
        const provider = config.Providers?.find((p: any) => p.name === providerName);

        if (provider) {
          // 处理 api_base_url，去掉 /v1/messages 后缀
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

          // 处理 api_key
          if (provider.api_key) {
            envOverrides = {
              ...envOverrides,
              ANTHROPIC_AUTH_TOKEN: provider.api_key,
            };
          }
        } else {
          console.error(`Provider "${providerName}" not found in config`);
          process.exit(1);
        }
      }

      // TODO: 处理 router 配置
      // 如果 preset 中有 router 配置且需要启动 server，可能需要临时修改配置文件

      if (shouldStartServer && !isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService()) {
          executeCodeCommand(codeArgs, presetConfig, envOverrides);
        } else {
          console.error(
            "Service startup timeout, please manually run `ccr start` to start the service"
          );
          process.exit(1);
        }
      } else {
        // 服务已运行或不需要启动 server
        if (shouldStartServer && !isRunning) {
          console.error("Service is not running. Please start it first with `ccr start`");
          process.exit(1);
        }
        executeCodeCommand(codeArgs, presetConfig, envOverrides);
      }
      return;
    } else {
      // 不是 preset 也不是已知命令
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
          "claude code router service has been successfully stopped."
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
      // 从stdin读取JSON输入
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
          const statusLine = await parseStatusLineData(input);
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
    case "activate":
    case "env":
      await activateCommand();
      break;
    case "code":
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

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
            "Service startup timeout, please manually run `ccr start` to start the service"
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
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

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
            const restartProcess = spawn("node", [cliPath, "start"], {
              detached: true,
              stdio: "ignore",
            });

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
                "Service startup still failing. Please manually run `ccr start` to start the service and check the logs."
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
      console.log(`ccw version: ${version}`);
      break;
    case "restart":
      // Stop the service if it's running
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
        console.log("claude code router service has been stopped.");
      } catch (e) {
        console.log("Service was not running or failed to stop.");
        cleanupPidFile();
      }

      // Start the service again in the background
      console.log("Starting claude code router service...");
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error);
        process.exit(1);
      });

      startProcess.unref();
      console.log("✅ Service started successfully in the background.");
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
