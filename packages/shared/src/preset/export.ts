/**
 * Preset export core functionality
 * Note: This module does not contain CLI interaction logic, interaction logic is provided by the caller
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { sanitizeConfig } from './sensitiveFields';
import { PresetFile, PresetMetadata, ManifestFile } from './types';
import { HOME_DIR } from '../constants';

/**
 * Export options
 */
export interface ExportOptions {
  output?: string;
  includeSensitive?: boolean;
  description?: string;
  author?: string;
  tags?: string;
}

/**
 * Export result
 */
export interface ExportResult {
  outputPath: string;
  sanitizedConfig: any;
  metadata: PresetMetadata;
  requiredInputs: any[];
  sanitizedCount: number;
}

/**
 * Create manifest object
 * @param presetName Preset name
 * @param config Configuration object
 * @param sanitizedConfig Sanitized configuration
 * @param options Export options
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
 * Export preset configuration
 * @param presetName Preset name
 * @param config Current configuration
 * @param options Export options
 * @returns Export result
 */
export async function exportPreset(
  presetName: string,
  config: any,
  options: ExportOptions = {}
): Promise<ExportResult> {
  // 1. Collect metadata
  const metadata: PresetMetadata = {
    name: presetName,
    version: '1.0.0',
    description: options.description,
    author: options.author,
    keywords: options.tags ? options.tags.split(',').map(t => t.trim()) : undefined,
  };

  // 2. Sanitize configuration
  const { sanitizedConfig, requiredInputs, sanitizedCount } = await sanitizeConfig(config);

  // 3. Generate manifest.json (flattened structure)
  const manifest: ManifestFile = {
    ...metadata,
    ...sanitizedConfig,
    requiredInputs: options.includeSensitive ? undefined : requiredInputs,
  };

  // 4. Determine output path
  const presetsDir = path.join(HOME_DIR, 'presets');

  // Ensure presets directory exists
  await fs.mkdir(presetsDir, { recursive: true });

  const outputPath = options.output || path.join(presetsDir, `${presetName}.ccrsets`);

  // 5. Create archive
  const output = fsSync.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Highest compression level
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

    // Connect output stream
    archive.pipe(output);

    // Add manifest.json to archive
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Finalize archive
    archive.finalize();
  });
}
