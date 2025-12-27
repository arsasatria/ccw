/**
 * 预设功能的类型定义
 */

// 敏感字段输入要求
export interface RequiredInput {
  field: string;                  // 字段路径 (如 "Providers[0].api_key")
  prompt?: string;                // 提示信息
  placeholder?: string;           // 占位符环境变量名
  defaultValue?: string;          // 默认值
  validator?: RegExp | string;    // 验证规则
}

// Provider 配置
export interface ProviderConfig {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: any;
  [key: string]: any;
}

// Router 配置
export interface RouterConfig {
  default?: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
  [key: string]: string | number | undefined;
}

// Transformer 配置
export interface TransformerConfig {
  path?: string;
  use: Array<string | [string, any]>;
  options?: any;
  [key: string]: any;
}

// 预设元数据（扁平化结构，用于manifest.json）
export interface PresetMetadata {
  name: string;                   // 预设名称
  version: string;                // 版本号 (semver)
  description?: string;           // 描述
  author?: string;                // 作者
  homepage?: string;              // 主页
  repository?: string;            // 源码仓库
  license?: string;               // 许可证
  keywords?: string[];            // 关键词（原tags）
  ccwVersion?: string;            // 兼容的 CCR 版本
  source?: string;                // 预设来源 URL
  sourceType?: 'local' | 'gist' | 'registry';
  checksum?: string;              // 预设内容校验和
}

// 预设配置部分
export interface PresetConfigSection {
  Providers?: ProviderConfig[];
  Router?: RouterConfig;
  transformers?: TransformerConfig[];
  PORT?: number;
  HOST?: string;
  API_TIMEOUT_MS?: number;
  PROXY_URL?: string;
  LOG?: boolean;
  LOG_LEVEL?: string;
  StatusLine?: any;
  NON_INTERACTIVE_MODE?: boolean;
  [key: string]: any;
}

// 完整的预设文件格式
export interface PresetFile {
  metadata?: PresetMetadata;
  config: PresetConfigSection;
  secrets?: {
    // 敏感信息存储，格式：字段路径 -> 值
    // 例如：{ "Providers[0].api_key": "sk-xxx", "APIKEY": "my-secret" }
    [fieldPath: string]: string;
  };
  requiredInputs?: RequiredInput[];
}

// manifest.json 格式（压缩包内的文件）
export interface ManifestFile extends PresetMetadata, PresetConfigSection {
  requiredInputs?: RequiredInput[];
}

// 在线预设索引条目
export interface PresetIndexEntry {
  id: string;                     // 唯一标识
  name: string;                   // 显示名称
  description?: string;           // 简短描述
  version: string;                // 最新版本
  author?: string;                // 作者
  downloads?: number;             // 下载次数
  stars?: number;                 // 点赞数
  tags?: string[];                // 标签
  url: string;                    // 下载地址
  checksum?: string;              // SHA256 校验和
  ccwVersion?: string;            // 兼容版本
}

// 在线预设仓库索引
export interface PresetRegistry {
  version: string;                // 索引格式版本
  lastUpdated: string;            // 最后更新时间
  presets: PresetIndexEntry[];
}

// 配置验证结果
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 合并策略枚举
export enum MergeStrategy {
  ASK = 'ask',                    // 交互式询问
  OVERWRITE = 'overwrite',        // 覆盖现有
  MERGE = 'merge',                // 智能合并
  SKIP = 'skip',                  // 跳过冲突项
}

// 脱敏结果
export interface SanitizeResult {
  sanitizedConfig: any;
  requiredInputs: RequiredInput[];
  sanitizedCount: number;
}

// Provider 冲突处理动作
export type ProviderConflictAction = 'keep' | 'overwrite' | 'merge' | 'skip';
