/**
 * 动态配置 Schema 处理器
 * 负责解析和验证配置 schema，处理条件逻辑和变量替换
 */

import {
  RequiredInput,
  InputType,
  Condition,
  DynamicOptions,
  InputOption,
  ConfigMapping,
  TemplateConfig,
  PresetConfigSection,
} from './types';

// 用户输入值集合
export interface UserInputValues {
  [inputId: string]: any;
}

/**
 * 解析字段路径（支持数组和嵌套）
 * 例如：Providers[0].name => ['Providers', '0', 'name']
 */
export function parseFieldPath(path: string): string[] {
  const regex = /(\w+)|\[(\d+)\]/g;
  const parts: string[] = [];
  let match;

  while ((match = regex.exec(path)) !== null) {
    parts.push(match[1] || match[2]);
  }

  return parts;
}

/**
 * 根据字段路径获取对象中的值
 */
export function getValueByPath(obj: any, path: string): any {
  const parts = parseFieldPath(path);
  let current = obj;

  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * 根据字段路径设置对象中的值
 */
export function setValueByPath(obj: any, path: string, value: any): void {
  const parts = parseFieldPath(path);
  const lastKey = parts.pop()!;
  let current = obj;

  for (const part of parts) {
    if (!(part in current)) {
      // 判断是数组还是对象
      const nextPart = parts[parts.indexOf(part) + 1];
      if (nextPart && /^\d+$/.test(nextPart)) {
        current[part] = [];
      } else {
        current[part] = {};
      }
    }
    current = current[part];
  }

  current[lastKey] = value;
}

/**
 * 评估条件表达式
 */
export function evaluateCondition(
  condition: Condition,
  values: UserInputValues
): boolean {
  const actualValue = values[condition.field];

  // 处理 exists 操作符
  if (condition.operator === 'exists') {
    return actualValue !== undefined && actualValue !== null;
  }

  // 处理 in 操作符
  if (condition.operator === 'in') {
    return Array.isArray(condition.value) && condition.value.includes(actualValue);
  }

  // 处理 nin 操作符
  if (condition.operator === 'nin') {
    return Array.isArray(condition.value) && !condition.value.includes(actualValue);
  }

  // 处理其他操作符
  switch (condition.operator) {
    case 'eq':
      return actualValue === condition.value;
    case 'ne':
      return actualValue !== condition.value;
    case 'gt':
      return actualValue > condition.value;
    case 'lt':
      return actualValue < condition.value;
    case 'gte':
      return actualValue >= condition.value;
    case 'lte':
      return actualValue <= condition.value;
    default:
      // 默认使用 eq
      return actualValue === condition.value;
  }
}

/**
 * 评估多个条件（AND 逻辑）
 */
export function evaluateConditions(
  conditions: Condition | Condition[],
  values: UserInputValues
): boolean {
  if (!conditions) {
    return true;
  }

  if (!Array.isArray(conditions)) {
    return evaluateCondition(conditions, values);
  }

  // 如果是数组，使用 AND 逻辑（所有条件都必须满足）
  return conditions.every(condition => evaluateCondition(condition, values));
}

/**
 * 判断字段是否应该显示
 */
export function shouldShowField(
  field: RequiredInput,
  values: UserInputValues
): boolean {
  if (!field.when) {
    return true;
  }

  return evaluateConditions(field.when, values);
}

/**
 * 获取动态选项列表
 */
export function getDynamicOptions(
  dynamicOptions: DynamicOptions,
  presetConfig: PresetConfigSection,
  values: UserInputValues
): InputOption[] {
  switch (dynamicOptions.type) {
    case 'static':
      return dynamicOptions.options || [];

    case 'providers': {
      // 从预设的 Providers 中提取选项
      const providers = presetConfig.Providers || [];
      return providers.map((p: any) => ({
        label: p.name || p.id || String(p),
        value: p.name || p.id || String(p),
        description: p.api_base_url,
      }));
    }

    case 'models': {
      // 从指定 provider 的 models 中提取
      const providerField = dynamicOptions.providerField;
      if (!providerField) {
        return [];
      }

      // 解析 provider 引用（如 {{selectedProvider}}）
      const providerId = String(providerField).replace(/^{{(.+)}}$/, '$1');
      const selectedProvider = values[providerId];

      if (!selectedProvider || !presetConfig.Providers) {
        return [];
      }

      // 查找对应的 provider
      const provider = presetConfig.Providers.find(
        (p: any) => p.name === selectedProvider || p.id === selectedProvider
      );

      if (!provider || !provider.models) {
        return [];
      }

      return provider.models.map((model: string) => ({
        label: model,
        value: model,
      }));
    }

    case 'custom':
      // 预留，暂未实现
      return [];

    default:
      return [];
  }
}

/**
 * 解析选项（支持静态和动态选项）
 */
export function resolveOptions(
  field: RequiredInput,
  presetConfig: PresetConfigSection,
  values: UserInputValues
): InputOption[] {
  if (!field.options) {
    return [];
  }

  // 判断是静态选项还是动态选项
  const options = field.options as any;

  if (Array.isArray(options)) {
    // 静态选项数组
    return options as InputOption[];
  }

  if (options.type) {
    // 动态选项
    return getDynamicOptions(options, presetConfig, values);
  }

  return [];
}

/**
 * 模板变量替换
 * 支持 {{variable}} 语法
 */
export function replaceTemplateVariables(
  template: any,
  values: UserInputValues
): any {
  if (template === null || template === undefined) {
    return template;
  }

  // 处理字符串
  if (typeof template === 'string') {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return values[key] !== undefined ? String(values[key]) : '';
    });
  }

  // 处理数组
  if (Array.isArray(template)) {
    return template.map(item => replaceTemplateVariables(item, values));
  }

  // 处理对象
  if (typeof template === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = replaceTemplateVariables(value, values);
    }
    return result;
  }

  // 其他类型直接返回
  return template;
}

/**
 * 应用配置映射
 */
export function applyConfigMappings(
  mappings: ConfigMapping[],
  values: UserInputValues,
  config: PresetConfigSection
): PresetConfigSection {
  const result = { ...config };

  for (const mapping of mappings) {
    // 检查条件
    if (mapping.when && !evaluateConditions(mapping.when, values)) {
      continue;
    }

    // 解析值
    let value: any;
    if (typeof mapping.value === 'string' && mapping.value.startsWith('{{')) {
      // 变量引用
      const varName = mapping.value.replace(/^{{(.+)}}$/, '$1');
      value = values[varName];
    } else {
      // 固定值
      value = mapping.value;
    }

    // 应用到目标路径
    setValueByPath(result, mapping.target, value);
  }

  return result;
}

/**
 * 验证用户输入
 */
export function validateInput(
  field: RequiredInput,
  value: any
): { valid: boolean; error?: string } {
  // 检查必填
  if (field.required !== false && (value === undefined || value === null || value === '')) {
    return {
      valid: false,
      error: `${field.label || field.id} is required`,
    };
  }

  // 如果值为空且非必填，跳过验证
  if (!value && field.required === false) {
    return { valid: true };
  }

  // 类型检查
  switch (field.type) {
    case InputType.NUMBER:
      if (isNaN(Number(value))) {
        return {
          valid: false,
          error: `${field.label || field.id} must be a number`,
        };
      }
      const numValue = Number(value);
      if (field.min !== undefined && numValue < field.min) {
        return {
          valid: false,
          error: `${field.label || field.id} must be at least ${field.min}`,
        };
      }
      if (field.max !== undefined && numValue > field.max) {
        return {
          valid: false,
          error: `${field.label || field.id} must be at most ${field.max}`,
        };
      }
      break;

    case InputType.SELECT:
    case InputType.MULTISELECT:
      // 检查值是否在选项中
      // 这里暂时跳过，因为需要动态获取选项
      break;
  }

  // 自定义验证器
  if (field.validator) {
    if (field.validator instanceof RegExp) {
      if (!field.validator.test(String(value))) {
        return {
          valid: false,
          error: `${field.label || field.id} format is invalid`,
        };
      }
    } else if (typeof field.validator === 'string') {
      const regex = new RegExp(field.validator);
      if (!regex.test(String(value))) {
        return {
          valid: false,
          error: `${field.label || field.id} format is invalid`,
        };
      }
    } else if (typeof field.validator === 'function') {
      const result = field.validator(value);
      if (result === false) {
        return {
          valid: false,
          error: `${field.label || field.id} is invalid`,
        };
      } else if (typeof result === 'string') {
        return {
          valid: false,
          error: result,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * 获取字段的默认值
 */
export function getDefaultValue(field: RequiredInput): any {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  // 根据类型返回默认值
  switch (field.type) {
    case InputType.CONFIRM:
      return false;
    case InputType.MULTISELECT:
      return [];
    case InputType.NUMBER:
      return 0;
    default:
      return '';
  }
}

/**
 * 根据依赖关系排序字段
 * 确保被依赖的字段排在前面
 */
export function sortFieldsByDependencies(
  fields: RequiredInput[]
): RequiredInput[] {
  const sorted: RequiredInput[] = [];
  const visited = new Set<string>();

  function visit(field: RequiredInput) {
    if (visited.has(field.id)) {
      return;
    }

    visited.add(field.id);

    // 先处理依赖的字段
    const dependencies = field.dependsOn || [];
    for (const depId of dependencies) {
      const depField = fields.find(f => f.id === depId);
      if (depField) {
        visit(depField);
      }
    }

    // 从 when 条件中提取依赖
    if (field.when) {
      const conditions = Array.isArray(field.when) ? field.when : [field.when];
      for (const cond of conditions) {
        const depField = fields.find(f => f.id === cond.field);
        if (depField) {
          visit(depField);
        }
      }
    }

    sorted.push(field);
  }

  for (const field of fields) {
    visit(field);
  }

  return sorted;
}

/**
 * 构建字段依赖图（用于优化更新顺序）
 */
export function buildDependencyGraph(
  fields: RequiredInput[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const field of fields) {
    const deps = new Set<string>();

    // 从 dependsOn 提取依赖
    if (field.dependsOn) {
      for (const dep of field.dependsOn) {
        deps.add(dep);
      }
    }

    // 从 when 条件提取依赖
    if (field.when) {
      const conditions = Array.isArray(field.when) ? field.when : [field.when];
      for (const cond of conditions) {
        deps.add(cond.field);
      }
    }

    // 从动态选项提取依赖
    if (field.options) {
      const options = field.options as any;
      if (options.type === 'models' && options.providerField) {
        const providerId = String(options.providerField).replace(/^{{(.+)}}$/, '$1');
        deps.add(providerId);
      }
    }

    graph.set(field.id, deps);
  }

  return graph;
}

/**
 * 获取受影响字段（当某个字段值变化时，哪些字段需要重新计算）
 */
export function getAffectedFields(
  changedFieldId: string,
  fields: RequiredInput[]
): Set<string> {
  const affected = new Set<string>();
  const graph = buildDependencyGraph(fields);

  // 找出所有依赖于 changedFieldId 的字段
  for (const [fieldId, deps] of graph.entries()) {
    if (deps.has(changedFieldId)) {
      affected.add(fieldId);
    }
  }

  return affected;
}
