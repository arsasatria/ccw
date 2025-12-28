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
  PresetFile,
  RequiredInput,
  UserInputValues,
  applyConfigMappings,
  replaceTemplateVariables,
  setValueByPath,
} from '@ccw/shared';
import { collectUserInputs } from '../prompt/schema-input';

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
 * 应用用户输入到配置（新版schema）
 */
function applyUserInputs(
  preset: PresetFile,
  values: UserInputValues
): PresetConfigSection {
  let config = { ...preset.config };

  // 1. 先应用 template（如果存在）
  if (preset.template) {
    config = replaceTemplateVariables(preset.template, values) as any;
  }

  // 2. 再应用 configMappings（如果存在）
  if (preset.configMappings && preset.configMappings.length > 0) {
    config = applyConfigMappings(preset.configMappings, values, config);
  }

  // 3. 兼容旧版：直接将 values 应用到 config
  // 检查是否有任何值没有通过 mappings 应用
  for (const [key, value] of Object.entries(values)) {
    // 如果这个值已经在 template 或 mappings 中处理过，跳过
    // 这里简化处理：直接应用所有值
    // 在实际使用中，template 和 mappings 应该覆盖所有需要设置的字段

    // 尝试智能判断：如果 key 包含 '.' 或 '['，说明是路径
    if (key.includes('.') || key.includes('[')) {
      setValueByPath(config, key, value);
    }
  }

  return config;
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
        console.log(`\n${GREEN}✓${RESET} Preset already configured`);
        console.log(`${DIM}You can use this preset with: ccr ${presetName}${RESET}\n`);
        return;
      }
    } catch {
      // manifest不存在，继续配置流程
    }

    // 收集用户输入
    let userInputs: UserInputValues = {};

    // 使用 schema 系统
    if (preset.schema && preset.schema.length > 0) {
      userInputs = await collectUserInputs(preset.schema, preset.config);
    }

    // 应用用户输入到配置
    const finalConfig = applyUserInputs(preset, userInputs);

    // 读取现有的manifest并更新
    const manifest: ManifestFile = {
      ...(preset.metadata || {}),
      ...finalConfig,
    };

    // 保存 schema（如果存在）
    if (preset.schema) {
      manifest.schema = preset.schema;
    }

    // 保存其他配置
    if (preset.template) {
      manifest.template = preset.template;
    }
    if (preset.configMappings) {
      manifest.configMappings = preset.configMappings;
    }

    // 保存到解压目录的manifest.json
    await saveManifest(presetName, manifest);

    // 显示摘要
    console.log(`\n${BOLDGREEN}✓ Preset configured successfully!${RESET}\n`);
    console.log(`${BOLDCYAN}Preset directory:${RESET} ${presetDir}`);
    console.log(`${BOLDCYAN}Inputs configured:${RESET} ${Object.keys(userInputs).length}`);

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
    console.log(`${DIM}Note: Configuration is stored in the manifest file${RESET}\n`);

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
