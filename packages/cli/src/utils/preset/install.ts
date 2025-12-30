/**
 * Preset installation functionality CLI layer
 * Handles CLI interactions, core logic is in the shared package
 */

import * as fs from 'fs/promises';
import * as path from 'path';
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
  UserInputValues,
} from '@ccw/shared';
import { collectUserInputs } from '../prompt/schema-input';

// Re-export loadPreset
export { loadPresetShared as loadPreset };

// ANSI color codes
const RESET = "\x1B[0m";
const GREEN = "\x1B[32m";
const BOLDGREEN = "\x1B[1m\x1B[32m";
const YELLOW = "\x1B[33m";
const BOLDYELLOW = "\x1B[1m\x1B[33m";
const BOLDCYAN = "\x1B[1m\x1B[36m";
const DIM = "\x1B[2m";

/**
 * Apply preset to configuration
 * @param presetName Preset name
 * @param preset Preset object
 */
export async function applyPresetCli(
  presetName: string,
  preset: PresetFile
): Promise<void> {
  try {
    console.log(`${BOLDCYAN}Loading preset...${RESET} ${GREEN}✓${RESET}`);

    // Validate preset
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

    // Check if configuration is required
    if (preset.schema && preset.schema.length > 0) {
      console.log(`\n${BOLDCYAN}Configuration required:${RESET} ${preset.schema.length} field(s)\n`);
    } else {
      console.log(`\n${DIM}No configuration required for this preset${RESET}\n`);
    }

    // Collect user inputs
    let userInputs: UserInputValues = {};

    // Use schema system
    if (preset.schema && preset.schema.length > 0) {
      userInputs = await collectUserInputs(preset.schema, preset.config);
    }

    // Build manifest, keep original config, store user values in userValues
    const manifest: ManifestFile = {
      name: presetName,
      version: preset.metadata?.version || '1.0.0',
      ...(preset.metadata || {}),
      ...preset.config,  // Keep original config (may contain placeholders)
    };

    // Save schema (if exists)
    if (preset.schema) {
      manifest.schema = preset.schema;
    }

    // Save other configurations
    if (preset.template) {
      manifest.template = preset.template;
    }
    if (preset.configMappings) {
      manifest.configMappings = preset.configMappings;
    }

    // Save user-filled values to userValues
    if (Object.keys(userInputs).length > 0) {
      manifest.userValues = userInputs;
    }

    // Save to manifest.json in extracted directory
    await saveManifest(presetName, manifest);

    const presetDir = getPresetDir(presetName);

    // Display summary
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
 * Install preset (main entry point)
 */
export async function installPresetCli(
  source: string,
  options: {
    strategy?: MergeStrategy;
    name?: string;
  } = {}
): Promise<void> {
  try {
    // Determine preset name
    let presetName = options.name;
    let sourceZip: string | undefined;
    let isReconfigure = false; // Whether to reconfigure installed preset

    // Determine source type and get ZIP file path
    if (source.startsWith('http://') || source.startsWith('https://')) {
      // URL: download to temp file
      if (!presetName) {
        const urlParts = source.split('/');
        const filename = urlParts[urlParts.length - 1];
        presetName = filename.replace('.ccrsets', '');
      }
      // downloadPresetToTemp imported from shared package will return temp file
      // but we'll auto-cleanup in loadPreset, so no need to handle here
      // Re-download to temp file for extractPreset usage
      // Since loadPreset already downloaded and deleted, special handling needed here
      throw new Error('URL installation not fully implemented yet');
    } else if (source.includes('/') || source.includes('\\')) {
      // File path
      if (!presetName) {
        const filename = path.basename(source);
        presetName = filename.replace('.ccrsets', '');
      }
      // Verify file exists
      try {
        await fs.access(source);
      } catch {
        throw new Error(`Preset file not found: ${source}`);
      }
      sourceZip = source;
    } else {
      // Preset name (without path)
      presetName = source;

      // Search files by priority: current directory -> presets directory
      const presetFile = await findPresetFile(source);

      if (presetFile) {
        sourceZip = presetFile;
      } else {
        // Check if already installed (directory exists)
        if (await isPresetInstalled(source)) {
          // Already installed, reconfigure
          isReconfigure = true;
        } else {
          // Neither exists, error
          throw new Error(`Preset '${source}' not found in current directory or presets directory.`);
        }
      }
    }

    if (isReconfigure) {
      // Reconfigure installed preset
      console.log(`${BOLDCYAN}Reconfiguring preset:${RESET} ${presetName}\n`);

      const presetDir = getPresetDir(presetName);
      const manifest = await readManifestFromDir(presetDir);
      const preset = manifestToPresetFile(manifest);

      // Apply preset (will ask for sensitive info)
      await applyPresetCli(presetName, preset);
    } else {
      // New installation: extract to target directory
      if (!sourceZip) {
        throw new Error('Source ZIP file is required for installation');
      }
      const targetDir = getPresetDir(presetName);
      console.log(`${BOLDCYAN}Extracting preset to:${RESET} ${targetDir}`);
      await extractPreset(sourceZip, targetDir);
      console.log(`${GREEN}✓${RESET} Extracted successfully\n`);

      // Read manifest from extracted directory
      const manifest = await readManifestFromDir(targetDir);
      const preset = manifestToPresetFile(manifest);

      // Apply preset (ask user info, etc.)
      await applyPresetCli(presetName, preset);
    }

  } catch (error: any) {
    console.error(`\n${YELLOW}Failed to install preset:${RESET} ${error.message}`);
    process.exit(1);
  }
}
