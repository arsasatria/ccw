/**
 * 预设安装功能 CLI 层
 * 负责处理 CLI 交互，核心逻辑在 shared 包中
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { password, confirm } from '@inquirer/prompts';
import {
  loadPreset as loadPresetShared,
  validatePreset,
  MergeStrategy,
  getPresetDir,
  readManifestFromDir,
  manifestToPresetFile,
  saveManifest,
  extractPreset,
  findPresetFile,
  isPresetInstalled,
  ManifestFile,
  PresetFile
} from '@ccw/shared';

// 重新导出 loadPreset
export { loadPresetShared as loadPreset };

// ANSI 颜色代码
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const BOLDGREEN = "\x1B[1m\x1B[32m";
const YELLOW = "\x1B[33m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const DIM = "\x1B[2m";

/**
 * 收集缺失的敏感信息
 */
async function collectSensitiveInputs(
  preset: PresetFile
): Promise<Record<string, string>> {
  const inputs: Record<string, string> = {};

  if (!preset.requiredInputs || preset.requiredInputs.length === 0) {
    return inputs;
  }

  console.log(`\n${BOLDYELLOW}This preset requires additional information:${RESET}\n`);

  for (const inputField of preset.requiredInputs) {
    let value: string;

    // 尝试从环境变量获取
    const envVarName = inputField.placeholder;
    if (envVarName && process.env[envVarName]) {
      const useEnv = await confirm({
        message: `Found ${envVarName} in environment. Use it?`,
        default: true,
      });

      if (useEnv) {
        value = process.env[envVarName]!;
        inputs[inputField.field] = value;
        console.log(`${GREEN}✓${RESET} Using ${envVarName} from environment\n`);
        continue;
      }
    }

    // 提示用户输入
    value = await password({
      message: inputField.prompt || `Enter ${inputField.field}:`,
      mask: '*',
    });

    if (!value || value.trim() === '') {
      console.error(`${YELLOW}Error:${RESET} ${inputField.field} is required`);
      process.exit(1);
    }

    // 验证输入
    if (inputField.validator) {
      const regex = typeof inputField.validator === 'string'
        ? new RegExp(inputField.validator)
        : inputField.validator;

      if (!regex.test(value)) {
        console.error(`${YELLOW}Error:${RESET} Invalid format for ${inputField.field}`);
        console.error(`  Expected: ${inputField.validator}`);
        process.exit(1);
      }
    }

    inputs[inputField.field] = value;
    console.log('');
  }

  return inputs;
}

/**
 * 应用预设到配置
 * @param presetName 预设名称
 * @param preset 预设对象
 */
export async function applyPresetCli(
  presetName: string,
  preset: PresetFile
): Promise<void> {
  try {
    console.log(`${BOLDCYAN}Loading preset...${RESET} ${GREEN}✓${RESET}`);

    // 验证预设
    const validation = await validatePreset(preset);
    if (validation.warnings.length > 0) {
      console.log(`\n${YELLOW}Warnings:${RESET}`);
      for (const warning of validation.warnings) {
        console.log(`  ${DIM}⚠${RESET} ${warning}`);
      }
    }

    if (!validation.valid) {
      console.log(`\n${YELLOW}Validation errors:${RESET}`);
      for (const error of validation.errors) {
        console.log(`  ${YELLOW}✗${RESET} ${error}`);
      }
      throw new Error('Invalid preset file');
    }

    console.log(`${BOLDCYAN}Validating preset...${RESET} ${GREEN}✓${RESET}`);

    // 检查是否已经配置过（通过检查manifest中是否已有敏感信息）
    const presetDir = getPresetDir(presetName);

    try {
      const existingManifest = await readManifestFromDir(presetDir);
      // 检查是否已经配置了敏感信息（例如api_key）
      const hasSecrets = existingManifest.Providers?.some((p: any) => p.api_key && p.api_key !== '');
      if (hasSecrets) {
        console.log(`\n${GREEN}✓${RESET} Preset already configured with secrets`);
        console.log(`${DIM}You can use this preset with: ccr ${presetName}${RESET}\n`);
        return;
      }
    } catch {
      // manifest不存在，继续配置流程
    }

    // 收集敏感信息
    const sensitiveInputs = await collectSensitiveInputs(preset);

    // 读取现有的manifest并更新
    const manifest: ManifestFile = {
      ...(preset.metadata || {}),
      ...preset.config,
    };

    // 将secrets信息应用到manifest中
    for (const [fieldPath, value] of Object.entries(sensitiveInputs)) {
      const keys = fieldPath.split(/[.\[\]]+/).filter(k => k !== '');
      let current = manifest as any;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      current[keys[keys.length - 1]] = value;
    }

    if (preset.requiredInputs) {
      manifest.requiredInputs = preset.requiredInputs;
    }

    // 保存到解压目录的manifest.json
    await saveManifest(presetName, manifest);

    // 显示摘要
    console.log(`\n${BOLDGREEN}✓ Preset configured successfully!${RESET}\n`);
    console.log(`${BOLDCYAN}Preset directory:${RESET} ${presetDir}`);
    console.log(`${BOLDCYAN}Secrets configured:${RESET} ${Object.keys(sensitiveInputs).length}`);

    if (preset.metadata?.description) {
      console.log(`\n${BOLDCYAN}Description:${RESET} ${preset.metadata.description}`);
    }

    if (preset.metadata?.author) {
      console.log(`${BOLDCYAN}Author:${RESET} ${preset.metadata.author}`);
    }

    const keywords = (preset.metadata as any).keywords;
    if (keywords && keywords.length > 0) {
      console.log(`${BOLDCYAN}Keywords:${RESET} ${keywords.join(', ')}`);
    }

    console.log(`\n${GREEN}Use this preset:${RESET} ccr ${presetName} "your prompt"`);
    console.log(`${DIM}Note: Secrets are stored in the manifest file${RESET}\n`);

  } catch (error: any) {
    console.error(`\n${YELLOW}Error applying preset:${RESET} ${error.message}`);
    throw error;
  }
}

/**
 * 安装预设（主入口）
 */
export async function installPresetCli(
  source: string,
  options: {
    strategy?: MergeStrategy;
    name?: string;
  } = {}
): Promise<void> {
  let tempFile: string | null = null;
  try {
    // 确定预设名称
    let presetName = options.name;
    let sourceZip: string;
    let isReconfigure = false; // 是否是重新配置已安装的preset

    // 判断source类型并获取ZIP文件路径
    if (source.startsWith('http://') || source.startsWith('https://')) {
      // URL：下载到临时文件
      if (!presetName) {
        const urlParts = source.split('/');
        const filename = urlParts[urlParts.length - 1];
        presetName = filename.replace('.ccrsets', '');
      }
      // 这里直接从 shared 包导入的 downloadPresetToTemp 会返回临时文件
      // 但我们会在 loadPreset 中自动清理，所以不需要在这里处理
      const preset = await loadPreset(source);
      if (!presetName) {
        presetName = preset.metadata?.name || 'preset';
      }
      // 重新下载到临时文件以供 extractPreset 使用
      // 由于 loadPreset 已经下载并删除了，这里需要特殊处理
      throw new Error('URL installation not fully implemented yet');
    } else if (source.includes('/') || source.includes('\\')) {
      // 文件路径
      if (!presetName) {
        const filename = path.basename(source);
        presetName = filename.replace('.ccrsets', '');
      }
      // 验证文件存在
      try {
        await fs.access(source);
      } catch {
        throw new Error(`Preset file not found: ${source}`);
      }
      sourceZip = source;
    } else {
      // 预设名称（不带路径）
      presetName = source;

      // 按优先级查找文件：当前目录 -> presets目录
      const presetFile = await findPresetFile(source);

      if (presetFile) {
        sourceZip = presetFile;
      } else {
        // 检查是否已安装（目录存在）
        if (await isPresetInstalled(source)) {
          // 已安装，重新配置
          isReconfigure = true;
        } else {
          // 都不存在，报错
          throw new Error(`Preset '${source}' not found in current directory or presets directory.`);
        }
      }
    }

    if (isReconfigure) {
      // 重新配置已安装的preset
      console.log(`${BOLDCYAN}Reconfiguring preset:${RESET} ${presetName}\n`);

      const presetDir = getPresetDir(presetName);
      const manifest = await readManifestFromDir(presetDir);
      const preset = manifestToPresetFile(manifest);

      // 应用preset（会询问敏感信息）
      await applyPresetCli(presetName, preset);
    } else {
      // 新安装：解压到目标目录
      const targetDir = getPresetDir(presetName);
      console.log(`${BOLDCYAN}Extracting preset to:${RESET} ${targetDir}`);
      await extractPreset(sourceZip, targetDir);
      console.log(`${GREEN}✓${RESET} Extracted successfully\n`);

      // 从解压目录读取manifest
      const manifest = await readManifestFromDir(targetDir);
      const preset = manifestToPresetFile(manifest);

      // 应用preset（询问用户信息等）
      await applyPresetCli(presetName, preset);
    }

  } catch (error: any) {
    console.error(`\n${YELLOW}Failed to install preset:${RESET} ${error.message}`);
    process.exit(1);
  }
}
