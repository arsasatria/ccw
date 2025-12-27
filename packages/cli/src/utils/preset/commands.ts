/**
 * 预设命令处理器 CLI 层
 * 负责处理 CLI 交互，核心逻辑在 shared 包中
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import { exportPresetCli } from './export';
import { installPresetCli, loadPreset } from './install';
import { MergeStrategy, HOME_DIR } from '@ccw/shared';

// ANSI 颜色代码
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";
const DIM = "\x1B[2m";

/**
 * 列出本地预设
 */
async function listPresets(): Promise<void> {
  const presetsDir = path.join(HOME_DIR, 'presets');

  try {
    await fs.access(presetsDir);
  } catch {
    console.log('\nNo presets directory found.');
    console.log(`\nCreate your first preset with: ${GREEN}ccr preset export <name>${RESET}\n`);
    return;
  }

  const entries = await fs.readdir(presetsDir, { withFileTypes: true });
  const presetDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);

  if (presetDirs.length === 0) {
    console.log('\nNo presets found.');
    console.log(`\nInstall a preset with: ${GREEN}ccr preset install <file>${RESET}\n`);
    return;
  }

  console.log(`\n${BOLDCYAN}Available presets:${RESET}\n`);

  for (const dirName of presetDirs) {
    const presetDir = path.join(presetsDir, dirName);
    try {
      const manifestPath = path.join(presetDir, 'manifest.json');
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON5.parse(content);

      // 从manifest中提取metadata字段
      const { Providers, Router, PORT, HOST, API_TIMEOUT_MS, PROXY_URL, LOG, LOG_LEVEL, StatusLine, NON_INTERACTIVE_MODE, requiredInputs, ...metadata } = manifest;

      const name = metadata.name || dirName;
      const description = metadata.description || '';
      const author = metadata.author || '';
      const version = metadata.version;

      // 显示预设名称
      if (version) {
        console.log(`${GREEN}•${RESET} ${BOLDCYAN}${name}${RESET} (v${version})`);
      } else {
        console.log(`${GREEN}•${RESET} ${BOLDCYAN}${name}${RESET}`);
      }

      // 显示描述
      if (description) {
        console.log(`  ${description}`);
      }

      // 显示作者
      if (author) {
        console.log(`  ${DIM}by ${author}${RESET}`);
      }

      console.log('');
    } catch (error) {
      console.log(`${YELLOW}•${RESET} ${dirName}`);
      console.log(`  ${DIM}(Error reading preset)${RESET}\n`);
    }
  }
}

/**
 * 删除预设
 */
async function deletePreset(name: string): Promise<void> {
  const presetsDir = path.join(HOME_DIR, 'presets');
  const presetDir = path.join(presetsDir, name);

  try {
    // 递归删除整个目录
    await fs.rm(presetDir, { recursive: true, force: true });
    console.log(`\n${GREEN}✓${RESET} Preset "${name}" deleted.\n`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`\n${YELLOW}Error:${RESET} Preset "${name}" not found.\n`);
    } else {
      console.error(`\n${YELLOW}Error:${RESET} ${error.message}\n`);
    }
    process.exit(1);
  }
}

/**
 * 显示预设信息
 */
async function showPresetInfo(name: string): Promise<void> {
  try {
    const preset = await loadPreset(name);

    const config = preset.config;
    const metadata = preset.metadata || {};

    console.log(`\n${BOLDCYAN}═══════════════════════════════════════════════${RESET}`);
    if (metadata.name) {
      console.log(`${BOLDCYAN}Preset: ${RESET}${metadata.name}`);
    } else {
      console.log(`${BOLDCYAN}Preset: ${RESET}${name}`);
    }
    console.log(`${BOLDCYAN}═══════════════════════════════════════════════${RESET}\n`);

    if (metadata.version) console.log(`${BOLDCYAN}Version:${RESET} ${metadata.version}`);
    if (metadata.description) console.log(`${BOLDCYAN}Description:${RESET} ${metadata.description}`);
    if (metadata.author) console.log(`${BOLDCYAN}Author:${RESET} ${metadata.author}`);
    const keywords = (metadata as any).keywords;
    if (keywords && keywords.length > 0) {
      console.log(`${BOLDCYAN}Keywords:${RESET} ${keywords.join(', ')}`);
    }

    console.log(`\n${BOLDCYAN}Configuration:${RESET}`);
    if (config.Providers) {
      console.log(`  Providers: ${config.Providers.length}`);
    }
    if (config.Router) {
      console.log(`  Router rules: ${Object.keys(config.Router).length}`);
    }
    if (config.provider) {
      console.log(`  Provider: ${config.provider}`);
    }

    if (preset.requiredInputs && preset.requiredInputs.length > 0) {
      console.log(`\n${BOLDYELLOW}Required inputs:${RESET}`);
      for (const input of preset.requiredInputs) {
        const envVar = input.placeholder || input.field;
        console.log(`  - ${input.field} ${DIM}(${envVar})${RESET}`);
      }
    }

    console.log('');
  } catch (error: any) {
    console.error(`\n${YELLOW}Error:${RESET} ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * 处理预设命令
 */
export async function handlePresetCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  switch (subCommand) {
    case 'export':
      const presetName = args[1];
      if (!presetName) {
        console.error('\nError: Preset name is required\n');
        console.error('Usage: ccr preset export <name> [--output <path>] [--description <text>] [--author <name>] [--tags <tags>]\n');
        process.exit(1);
      }

      // 解析选项
      const options: any = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--output' && args[i + 1]) {
          options.output = args[++i];
        } else if (args[i] === '--description' && args[i + 1]) {
          options.description = args[++i];
        } else if (args[i] === '--author' && args[i + 1]) {
          options.author = args[++i];
        } else if (args[i] === '--tags' && args[i + 1]) {
          options.tags = args[++i];
        } else if (args[i] === '--include-sensitive') {
          options.includeSensitive = true;
        }
      }

      await exportPresetCli(presetName, options);
      break;

    case 'install':
      const source = args[1];
      if (!source) {
        console.error('\nError: Preset source is required\n');
        console.error('Usage: ccr preset install <file | url | name>\n');
        process.exit(1);
      }

      // 解析选项
      const installOptions: any = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--strategy' && args[i + 1]) {
          const strategy = args[++i];
          if (['ask', 'overwrite', 'merge', 'skip'].includes(strategy)) {
            installOptions.strategy = strategy as MergeStrategy;
          } else {
            console.error(`\nError: Invalid merge strategy "${strategy}"\n`);
            console.error('Valid strategies: ask, overwrite, merge, skip\n');
            process.exit(1);
          }
        }
      }

      await installPresetCli(source, installOptions);
      break;

    case 'list':
      await listPresets();
      break;

    case 'delete':
    case 'rm':
    case 'remove':
      const deleteName = args[1];
      if (!deleteName) {
        console.error('\nError: Preset name is required\n');
        console.error('Usage: ccr preset delete <name>\n');
        process.exit(1);
      }
      await deletePreset(deleteName);
      break;

    case 'info':
      const infoName = args[1];
      if (!infoName) {
        console.error('\nError: Preset name is required\n');
        console.error('Usage: ccr preset info <name>\n');
        process.exit(1);
      }
      await showPresetInfo(infoName);
      break;

    default:
      console.error(`\nError: Unknown preset command "${subCommand}"\n`);
      console.error('Available commands:');
      console.error('  ccr preset export <name>      Export current configuration as a preset');
      console.error('  ccr preset install <source>   Install a preset from file, URL, or registry');
      console.error('  ccr preset list              List installed presets');
      console.error('  ccr preset info <name>        Show preset information');
      console.error('  ccr preset delete <name>      Delete a preset\n');
      process.exit(1);
  }
}
