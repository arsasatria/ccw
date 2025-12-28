/**
 * 预设功能的类型定义
 */

// 输入类型枚举
export enum InputType {
  PASSWORD = 'password',         // 密码输入（隐藏）
  INPUT = 'input',               // 文本输入
  SELECT = 'select',             // 单选
  MULTISELECT = 'multiselect',   // 多选
  CONFIRM = 'confirm',           // 确认框
  EDITOR = 'editor',             // 多行文本编辑器
  NUMBER = 'number',             // 数字输入
}

// 选项定义
export interface InputOption {
  label: string;                 // 显示文本
  value: string | number | boolean; // 实际值
  description?: string;          // 选项描述
  disabled?: boolean;            // 是否禁用
  icon?: string;                 // 图标
}

// 动态选项源
export interface DynamicOptions {
  type: 'static' | 'providers' | 'models' | 'custom';
  // static: 使用固定的 options 数组
  // providers: 从 Providers 配置中动态获取
  // models: 从指定 provider 的 models 中获取
  // custom: 自定义函数（暂未实现，预留）

  // 当 type 为 'static' 时使用
  options?: InputOption[];

  // 当 type 为 'providers' 时使用
  // 自动从预设的 Providers 中提取 name 和相关配置

  // 当 type 为 'models' 时使用
  providerField?: string;        // 指向 provider 选择器的字段路径（如 "{{selectedProvider}}"）

  // 当 type 为 'custom' 时使用（预留）
  source?: string;               // 自定义数据源
}

// 条件表达式
export interface Condition {
  field: string;                 // 依赖的字段路径
  operator?: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';
  value?: any;                   // 比较值
  // eq: 等于
  // ne: 不等于
  // in: 包含于（数组）
  // nin: 不包含于（数组）
  // gt: 大于
  // lt: 小于
  // gte: 大于等于
  // lte: 小于等于
  // exists: 字段存在（不检查值）
}

// 复杂的字段输入配置
export interface RequiredInput {
  id: string;                    // 唯一标识符（用于变量引用）
  type?: InputType;              // 输入类型，默认为 password
  label?: string;                // 显示标签
  prompt?: string;               // 提示信息/描述
  placeholder?: string;          // 占位符

  // 选项配置（用于 select/multiselect）
  options?: InputOption[] | DynamicOptions;

  // 条件显示
  when?: Condition | Condition[]; // 满足条件时才显示此字段（支持 AND/OR 逻辑）

  // 默认值
  defaultValue?: any;

  // 验证规则
  required?: boolean;            // 是否必填，默认 true
  validator?: RegExp | string | ((value: any) => boolean | string);

  // UI 配置
  min?: number;                  // 最小值（用于 number）
  max?: number;                  // 最大值（用于 number）
  rows?: number;                 // 行数（用于 editor）

  // 高级配置
  dependsOn?: string[];          // 显式声明依赖的字段（用于优化更新顺序）
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
  keywords?: string[];            // 关键词
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
  StatusLine?: any;
  NON_INTERACTIVE_MODE?: boolean;
  [key: string]: any;
}

// 模板配置（用于根据用户输入动态生成配置）
export interface TemplateConfig {
  // 使用 {{variable}} 语法的模板配置
  // 例如：{ "Providers": [{ "name": "{{providerName}}", "api_key": "{{apiKey}}" }] }
  [key: string]: any;
}

// 配置映射（将用户输入的值映射到配置的具体位置）
export interface ConfigMapping {
  // 字段路径（支持数组语法，如 "Providers[0].api_key"）
  target: string;

  // 值来源（引用用户输入的 id，或使用固定值）
  value: string | any;  // 如果是 string 且以 {{ 开头，则作为变量引用

  // 条件（可选，满足条件时才应用此映射）
  when?: Condition | Condition[];
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

  // === 动态配置系统 ===
  // 配置输入schema
  schema?: RequiredInput[];

  // 配置模板（使用变量替换）
  template?: TemplateConfig;

  // 配置映射（将用户输入映射到配置）
  configMappings?: ConfigMapping[];
}

// manifest.json 格式（压缩包内的文件）
export interface ManifestFile extends PresetMetadata, PresetConfigSection {
  // === 动态配置系统 ===
  schema?: RequiredInput[];
  template?: TemplateConfig;
  configMappings?: ConfigMapping[];
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

// Preset 信息（用于列表展示）
export interface PresetInfo {
  name: string;                   // 预设名称
  version?: string;               // 版本号
  description?: string;           // 描述
  author?: string;                // 作者
  config: PresetConfigSection;
}
