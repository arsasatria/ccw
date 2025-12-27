/**
 * 读取预设配置文件
 * 用于 CLI 快速读取预设配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import JSON5 from 'json5';
import { HOME_DIR } from '../constants';

/**
 * 读取 preset 配置文件
 * @param name preset 名称
 * @returns preset 配置对象，如果文件不存在则返回 null
 */
export async function readPresetFile(name: string): Promise<any | null> {
  try {
    const presetDir = path.join(HOME_DIR, 'presets', name);
    const manifestPath = path.join(presetDir, 'manifest.json');
    const manifest = JSON5.parse(await fs.readFile(manifestPath, 'utf-8'));
    // manifest已经是扁平化结构，直接返回
    return manifest;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Failed to read preset file: ${error.message}`);
    return null;
  }
}
