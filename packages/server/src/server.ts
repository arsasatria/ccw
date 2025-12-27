import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { homedir } from "os";
import { calculateTokenCount } from "./utils/router";
import {
  getPresetDir,
  readManifestFromDir,
  manifestToPresetFile,
  extractPreset,
  validatePreset,
  loadPreset,
  saveManifest,
  isPresetInstalled,
  downloadPresetToTemp,
  getTempDir,
  HOME_DIR,
  type PresetFile,
  type ManifestFile,
  type PresetMetadata,
  MergeStrategy
} from "@ccw/shared";

export const createServer = async (config: any): Promise<any> => {
  const server = new Server(config);
  const app = server.app;

  // Register multipart plugin for file uploads (dynamic import)
  const fastifyMultipart = await import('@fastify/multipart');
  app.register(fastifyMultipart.default, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  app.post("/v1/messages/count_tokens", async (req: any, reply: any) => {
    const {messages, tools, system} = req.body;
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  app.get("/api/config", async (req: any, reply: any) => {
    return await readConfigFile();
  });

  app.get("/api/transformers", async (req: any, reply: any) => {
    const transformers =
      (app as any)._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  app.post("/api/config", async (req: any, reply: any) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Register static file serving with caching
  app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  app.get("/ui", async (_: any, reply: any) => {
    return reply.redirect("/ui/");
  });

  // 获取日志文件列表端点
  app.get("/api/logs/files", async (req: any, reply: any) => {
    try {
      const logDir = join(homedir(), ".ccw", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // 按修改时间倒序排列
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // 获取日志内容端点
  app.get("/api/logs", async (req: any, reply: any) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".ccw", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // 清除日志内容端点
  app.delete("/api/logs", async (req: any, reply: any) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".ccw", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // ========== Preset 相关 API ==========

  // 获取预设列表
  app.get("/api/presets", async (req: any, reply: any) => {
    try {
      const presetsDir = join(HOME_DIR, "presets");

      if (!existsSync(presetsDir)) {
        return { presets: [] };
      }

      const entries = readdirSync(presetsDir, { withFileTypes: true });
      const presetDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);

      const presets: Array<PresetMetadata & { installed: boolean; id: string }> = [];

      for (const dirName of presetDirs) {
        const presetDir = join(presetsDir, dirName);
        try {
          const manifestPath = join(presetDir, "manifest.json");
          const content = readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(content);

          // 提取 metadata 字段
          const { Providers, Router, PORT, HOST, API_TIMEOUT_MS, PROXY_URL, LOG, LOG_LEVEL, StatusLine, NON_INTERACTIVE_MODE, requiredInputs, ...metadata } = manifest;

          presets.push({
            id: dirName,  // 目录名作为唯一标识
            name: metadata.name || dirName,
            version: metadata.version || '1.0.0',
            description: metadata.description,
            author: metadata.author,
            homepage: metadata.homepage,
            repository: metadata.repository,
            license: metadata.license,
            keywords: metadata.keywords,
            ccwVersion: metadata.ccwVersion,
            source: metadata.source,
            sourceType: metadata.sourceType,
            checksum: metadata.checksum,
            installed: true,
          });
        } catch (error) {
          console.error(`Failed to read preset ${dirName}:`, error);
        }
      }

      return { presets };
    } catch (error) {
      console.error("Failed to get presets:", error);
      reply.status(500).send({ error: "Failed to get presets" });
    }
  });

  // 获取预设详情
  app.get("/api/presets/:name", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      const manifest = await readManifestFromDir(presetDir);
      const preset = manifestToPresetFile(manifest);

      return preset;
    } catch (error: any) {
      console.error("Failed to get preset:", error);
      reply.status(500).send({ error: error.message || "Failed to get preset" });
    }
  });

  // 上传并安装预设（支持文件上传）
  app.post("/api/presets/install", async (req: any, reply: any) => {
    try {
      const { source, name, url } = req.body;

      // 如果提供了 URL，从 URL 下载
      if (url) {
        const tempFile = await downloadPresetToTemp(url);
        const preset = await loadPresetFromZip(tempFile);

        // 确定预设名称
        const presetName = name || preset.metadata?.name || `preset-${Date.now()}`;

        // 检查是否已安装
        if (await isPresetInstalled(presetName)) {
          reply.status(409).send({ error: "Preset already installed" });
          return;
        }

        // 解压到目标目录
        const targetDir = getPresetDir(presetName);
        await extractPreset(tempFile, targetDir);

        // 清理临时文件
        unlinkSync(tempFile);

        return {
          success: true,
          presetName,
          preset: {
            ...preset.metadata,
            installed: true,
          }
        };
      }

      // 如果没有 URL，需要处理文件上传（使用 multipart/form-data）
      // 这部分需要在客户端使用 FormData 上传
      reply.status(400).send({ error: "Please provide a URL or upload a file" });
    } catch (error: any) {
      console.error("Failed to install preset:", error);
      reply.status(500).send({ error: error.message || "Failed to install preset" });
    }
  });

  // 上传预设文件（multipart/form-data）
  app.post("/api/presets/upload", async (req: any, reply: any) => {
    try {
      const data = await req.file();
      if (!data) {
        reply.status(400).send({ error: "No file uploaded" });
        return;
      }

      const tempDir = getTempDir();
      mkdirSync(tempDir, { recursive: true });

      const tempFile = join(tempDir, `preset-${Date.now()}.ccrsets`);

      // 保存上传的文件到临时位置
      const buffer = await data.toBuffer();
      writeFileSync(tempFile, buffer);

      // 加载预设
      const preset = await loadPresetFromZip(tempFile);

      // 确定预设名称
      const presetName = data.fields.name?.value || preset.metadata?.name || `preset-${Date.now()}`;

      // 检查是否已安装
      if (await isPresetInstalled(presetName)) {
        unlinkSync(tempFile);
        reply.status(409).send({ error: "Preset already installed" });
        return;
      }

      // 解压到目标目录
      const targetDir = getPresetDir(presetName);
      await extractPreset(tempFile, targetDir);

      // 清理临时文件
      unlinkSync(tempFile);

      return {
        success: true,
        presetName,
        preset: {
          ...preset.metadata,
          installed: true,
        }
      };
    } catch (error: any) {
      console.error("Failed to upload preset:", error);
      reply.status(500).send({ error: error.message || "Failed to upload preset" });
    }
  });

  // 应用预设（配置敏感信息）
  app.post("/api/presets/:name/apply", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const { secrets } = req.body;

      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      // 读取现有 manifest
      const manifest = await readManifestFromDir(presetDir);

      // 将 secrets 信息应用到 manifest 中
      if (secrets) {
        for (const [fieldPath, value] of Object.entries(secrets)) {
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
      }

      // 保存更新后的 manifest
      await saveManifest(name, manifest);

      return { success: true, message: "Preset applied successfully" };
    } catch (error: any) {
      console.error("Failed to apply preset:", error);
      reply.status(500).send({ error: error.message || "Failed to apply preset" });
    }
  });

  // 删除预设
  app.delete("/api/presets/:name", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      // 递归删除整个目录
      rmSync(presetDir, { recursive: true, force: true });

      return { success: true, message: "Preset deleted successfully" };
    } catch (error: any) {
      console.error("Failed to delete preset:", error);
      reply.status(500).send({ error: error.message || "Failed to delete preset" });
    }
  });

  // 辅助函数：从 ZIP 加载预设
  async function loadPresetFromZip(zipFile: string): Promise<PresetFile> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(zipFile);
    const entry = zip.getEntry('manifest.json');
    if (!entry) {
      throw new Error('Invalid preset file: manifest.json not found');
    }
    const manifest = JSON.parse(entry.getData().toString('utf-8')) as ManifestFile;
    return manifestToPresetFile(manifest);
  }

  return server;
};
