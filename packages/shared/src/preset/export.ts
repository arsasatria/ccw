/**
 * 预设导出核心功能
 * 注意：这个模块不包含 CLI 交互逻辑，交互逻辑由调用者提供
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { sanitizeConfig } from './sensitiveFields';
import { PresetFile, PresetMetadata, ManifestFile } from './types';
import { HOME_DIR } from '../constants';

/**
 * 导出选项
 */
export interface ExportOptions {
  output?: string;
  includeSensitive?: boolean;
  description?: string;
  author?: string;
  tags?: string;
}

/**
 * 导出结果
 */
export interface ExportResult {
  outputPath: string;
  sanitizedConfig: any;
  metadata: PresetMetadata;
  requiredInputs: any[];
  sanitizedCount: number;
}

/**
 * 创建 manifest 对象
 * @param presetName 预设名称
 * @param config 配置对象
 * @param sanitizedConfig 脱敏后的配置
 * @param options 导出选项
 */
export function createManifest(
  presetName: string,
  config: any,
  sanitizedConfig: any,
  options: ExportOptions,
  requiredInputs: any[] = []
): ManifestFile {
  const metadata: PresetMetadata = {
    name: presetName,
    version: '1.0.0',
    description: options.description,
    author: options.author,
    keywords: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
  };

  return {
    ...metadata,
    ...sanitizedConfig,
    requiredInputs: options.includeSensitive ? undefined : requiredInputs,
  };
}

/**
 * 导出预设配置
 * @param presetName 预设名称
 * @param config 当前配置
 * @param options 导出选项
 * @returns 导出结果
 */
export async function exportPreset(
  presetName: string,
  config: any,
  options: ExportOptions = {}
): Promise<ExportResult> {
  // 1. 收集元数据
  const metadata: PresetMetadata = {
    name: presetName,
    version: '1.0.0',
    description: options.description,
    author: options.author,
    keywords: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
  };

  // 2. 脱敏配置
  const { sanitizedConfig, requiredInputs, sanitizedCount } = await sanitizeConfig(config);

  // 3. 生成manifest.json（扁平化结构）
  const manifest: ManifestFile = {
    ...metadata,
    ...sanitizedConfig,
    requiredInputs: options.includeSensitive ? undefined : requiredInputs,
  };

  // 4. 确定输出路径
  const presetsDir = path.join(HOME_DIR, 'presets');

  // 确保预设目录存在
  await fs.mkdir(presetsDir, { recursive: true });

  const outputPath = options.output || path.join(presetsDir, `${presetName}.ccrsets`);

  // 5. 创建压缩包
  const output = fsSync.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // 最高压缩级别
  });

  return new Promise<ExportResult>((resolve, reject) => {
    output.on('close', () => {
      resolve({
        outputPath,
        sanitizedConfig,
        metadata,
        requiredInputs,
        sanitizedCount,
      });
    });

    archive.on('error', (err: Error) => {
      reject(err);
    });

    // 连接输出流
    archive.pipe(output);

    // 添加manifest.json到压缩包
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // 完成压缩
    archive.finalize();
  });
}
