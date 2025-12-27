/**
 * 预设安装核心功能
 * 注意：这个模块不包含 CLI 交互逻辑，交互逻辑由调用者提供
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import AdmZip from 'adm-zip';
import { PresetFile, MergeStrategy, RequiredInput, ManifestFile } from './types';
import { HOME_DIR } from '../constants';

/**
 * 获取预设目录的完整路径
 * @param presetName 预设名称
 */
export function getPresetDir(presetName: string): string {
  return path.join(HOME_DIR, 'presets', presetName);
}

/**
 * 获取临时目录路径
 */
export function getTempDir(): string {
  return path.join(HOME_DIR, 'temp');
}

/**
 * 解压预设文件到目标目录
 * @param sourceZip 源ZIP文件路径
 * @param targetDir 目标目录
 */
export async function extractPreset(sourceZip: string, targetDir: string): Promise<void> {
  // 检查目标目录是否已存在
  try {
    await fs.access(targetDir);
    throw new Error(`Preset directory already exists: ${path.basename(targetDir)}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // ENOENT 表示目录不存在，可以继续
  }

  // 创建目标目录
  await fs.mkdir(targetDir, { recursive: true });

  // 解压文件
  const zip = new AdmZip(sourceZip);
  zip.extractAllTo(targetDir, true);
}

/**
 * 从解压目录读取manifest
 * @param presetDir 预设目录路径
 */
export async function readManifestFromDir(presetDir: string): Promise<ManifestFile> {
  const manifestPath = path.join(presetDir, 'manifest.json');
  const content = await fs.readFile(manifestPath, 'utf-8');
  return JSON5.parse(content) as ManifestFile;
}

/**
 * 将manifest转换为PresetFile格式
 */
export function manifestToPresetFile(manifest: ManifestFile): PresetFile {
  const { Providers, Router, PORT, HOST, API_TIMEOUT_MS, PROXY_URL, LOG, LOG_LEVEL, StatusLine, NON_INTERACTIVE_MODE, requiredInputs, ...metadata } = manifest;
  return {
    metadata,
    config: { Providers, Router, PORT, HOST, API_TIMEOUT_MS, PROXY_URL, LOG, LOG_LEVEL, StatusLine, NON_INTERACTIVE_MODE },
    requiredInputs,
  };
}

/**
 * 下载预设文件到临时位置
 * @param url 下载URL
 * @returns 临时文件路径
 */
export async function downloadPresetToTemp(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download preset: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();

  // 创建临时文件
  const tempDir = getTempDir();
  await fs.mkdir(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `preset-${Date.now()}.ccrsets`);
  await fs.writeFile(tempFile, Buffer.from(buffer));

  return tempFile;
}

/**
 * 从本地ZIP文件加载预设
 * @param zipFile ZIP文件路径
 * @returns PresetFile
 */
export async function loadPresetFromZip(zipFile: string): Promise<PresetFile> {
  const zip = new AdmZip(zipFile);
  const entry = zip.getEntry('manifest.json');
  if (!entry) {
    throw new Error('Invalid preset file: manifest.json not found');
  }
  const manifest = JSON5.parse(entry.getData().toString('utf-8')) as ManifestFile;
  return manifestToPresetFile(manifest);
}

/**
 * 加载预设文件
 * @param source 预设来源（文件路径、URL 或预设名称）
 */
export async function loadPreset(source: string): Promise<PresetFile> {
  // 判断是否是 URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const tempFile = await downloadPresetToTemp(source);
    const preset = await loadPresetFromZip(tempFile);
    // 删除临时文件
    await fs.unlink(tempFile).catch(() => {});
    return preset;
  }

  // 判断是否是绝对路径或相对路径（包含 / 或 \）
  if (source.includes('/') || source.includes('\\')) {
    // 文件路径
    return await loadPresetFromZip(source);
  }

  // 否则作为预设名称处理（从解压目录读取）
  const presetDir = getPresetDir(source);
  const manifest = await readManifestFromDir(presetDir);
  return manifestToPresetFile(manifest);
}

/**
 * 验证预设文件
 */
export async function validatePreset(preset: PresetFile): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证元数据
  if (!preset.metadata) {
    warnings.push('Missing metadata section');
  } else {
    if (!preset.metadata.name) {
      errors.push('Missing preset name in metadata');
    }
    if (!preset.metadata.version) {
      warnings.push('Missing version in metadata');
    }
  }

  // 验证配置部分
  if (!preset.config) {
    errors.push('Missing config section');
  }

  // 验证 Providers
  if (preset.config.Providers) {
    for (const provider of preset.config.Providers) {
      if (!provider.name) {
        errors.push('Provider missing name field');
      }
      if (!provider.api_base_url) {
        errors.push(`Provider "${provider.name}" missing api_base_url`);
      }
      if (!provider.models || provider.models.length === 0) {
        warnings.push(`Provider "${provider.name}" has no models`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 保存 manifest 到预设目录
 * @param presetName 预设名称
 * @param manifest manifest 对象
 */
export async function saveManifest(presetName: string, manifest: ManifestFile): Promise<void> {
  const presetDir = getPresetDir(presetName);
  const manifestPath = path.join(presetDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * 查找预设文件
 * @param source 预设来源
 * @returns 文件路径或 null
 */
export async function findPresetFile(source: string): Promise<string | null> {
  // 当前目录文件
  const currentDirFile = path.join(process.cwd(), `${source}.ccrsets`);

  // presets 目录文件
  const presetsDirFile = path.join(HOME_DIR, 'presets', `${source}.ccrsets`);

  // 检查当前目录
  try {
    await fs.access(currentDirFile);
    return currentDirFile;
  } catch {
    // 检查presets目录
    try {
      await fs.access(presetsDirFile);
      return presetsDirFile;
    } catch {
      return null;
    }
  }
}

/**
 * 检查预设是否已安装
 * @param presetName 预设名称
 */
export async function isPresetInstalled(presetName: string): Promise<boolean> {
  const presetDir = getPresetDir(presetName);
  try {
    await fs.access(presetDir);
    return true;
  } catch {
    return false;
  }
}
