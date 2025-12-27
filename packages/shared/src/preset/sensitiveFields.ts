/**
 * 敏感字段识别和脱敏功能
 */

import { RequiredInput, SanitizeResult } from './types';

// 敏感字段模式列表
const SENSITIVE_PATTERNS = [
  'api_key', 'apikey', 'apiKey', 'APIKEY',
  'api_secret', 'apisecret', 'apiSecret',
  'secret', 'SECRET',
  'token', 'TOKEN', 'auth_token',
  'password', 'PASSWORD', 'passwd',
  'private_key', 'privateKey',
  'access_key', 'accessKey',
];

// 环境变量占位符正则
const ENV_VAR_REGEX = /^\$\{?[A-Z_][A-Z0-9_]*\}?$/;

/**
 * 检查字段名是否为敏感字段
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_PATTERNS.some(pattern =>
    lowerFieldName.includes(pattern.toLowerCase())
  );
}

/**
 * 生成环境变量名称
 * @param fieldType 字段类型 (provider, transformer, global)
 * @param entityName 实体名称 (如 provider name)
 * @param fieldName 字段名称
 */
export function generateEnvVarName(
  fieldType: 'provider' | 'transformer' | 'global',
  entityName: string,
  fieldName: string
): string {
  // 生成大写的环境变量名
  // 例如: DEEPSEEK_API_KEY, CUSTOM_TRANSFORMER_SECRET
  const prefix = entityName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const field = fieldName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  // 如果前缀和字段名相同（如 API_KEY），避免重复
  if (prefix === field) {
    return prefix;
  }

  return `${prefix}_${field}`;
}

/**
 * 检查值是否已经是环境变量占位符
 */
function isEnvPlaceholder(value: any): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return ENV_VAR_REGEX.test(value.trim());
}

/**
 * 从环境变量占位符中提取变量名
 * @param value 环境变量值（如 $VAR 或 ${VAR}）
 */
function extractEnvVarName(value: string): string | null {
  const trimmed = value.trim();

  // 匹配 ${VAR_NAME} 格式
  const bracedMatch = trimmed.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  if (bracedMatch) {
    return bracedMatch[1];
  }

  // 匹配 $VAR_NAME 格式
  const unbracedMatch = trimmed.match(/^\$([A-Z_][A-Z0-9_]*)$/);
  if (unbracedMatch) {
    return unbracedMatch[1];
  }

  return null;
}

/**
 * 递归遍历对象，识别和脱敏敏感字段
 * @param config 配置对象
 * @param path 当前字段路径
 * @param requiredInputs 必需输入数组（累积）
 * @param sanitizedCount 脱敏字段计数
 */
function sanitizeObject(
  config: any,
  path: string = '',
  requiredInputs: RequiredInput[] = [],
  sanitizedCount: number = 0
): { sanitized: any; requiredInputs: RequiredInput[]; count: number } {
  if (!config || typeof config !== 'object') {
    return { sanitized: config, requiredInputs, count: sanitizedCount };
  }

  if (Array.isArray(config)) {
    const sanitizedArray: any[] = [];
    for (let i = 0; i < config.length; i++) {
      const result = sanitizeObject(
        config[i],
        path ? `${path}[${i}]` : `[${i}]`,
        requiredInputs,
        sanitizedCount
      );
      sanitizedArray.push(result.sanitized);
      requiredInputs = result.requiredInputs;
      sanitizedCount = result.count;
    }
    return { sanitized: sanitizedArray, requiredInputs, count: sanitizedCount };
  }

  const sanitizedObj: any = {};
  for (const [key, value] of Object.entries(config)) {
    const currentPath = path ? `${path}.${key}` : key;

    // 检查是否是敏感字段
    if (isSensitiveField(key) && typeof value === 'string') {
      // 如果值已经是环境变量，保持不变
      if (isEnvPlaceholder(value)) {
        sanitizedObj[key] = value;
        // 仍然需要记录为必需输入，但使用已有环境变量
        const envVarName = extractEnvVarName(value);
        if (envVarName && !requiredInputs.some(input => input.field === currentPath)) {
          requiredInputs.push({
            field: currentPath,
            prompt: `Enter ${key}`,
            placeholder: envVarName,
          });
        }
      } else {
        // 脱敏：替换为环境变量占位符
        // 尝试从路径中推断实体名称
        let entityName = 'CONFIG';
        const pathParts = currentPath.split('.');

        // 如果路径包含 Providers 或 transformers，尝试提取实体名称
        for (let i = 0; i < pathParts.length; i++) {
          if (pathParts[i] === 'Providers' || pathParts[i] === 'transformers') {
            // 查找 name 字段
            if (i + 1 < pathParts.length && pathParts[i + 1].match(/^\d+$/)) {
              // 这是数组索引，查找同级的 name 字段
              const parentPath = pathParts.slice(0, i + 2).join('.');
              // 在当前上下文中查找 name
              const context = config;
              if (context.name) {
                entityName = context.name;
              }
            }
            break;
          }
        }

        const envVarName = generateEnvVarName('global', entityName, key);
        sanitizedObj[key] = `\${${envVarName}}`;

        // 记录为必需输入
        requiredInputs.push({
          field: currentPath,
          prompt: `Enter ${key}`,
          placeholder: envVarName,
        });

        sanitizedCount++;
      }
    } else if (typeof value === 'object' && value !== null) {
      // 递归处理嵌套对象
      const result = sanitizeObject(value, currentPath, requiredInputs, sanitizedCount);
      sanitizedObj[key] = result.sanitized;
      requiredInputs = result.requiredInputs;
      sanitizedCount = result.count;
    } else {
      // 保留原始值
      sanitizedObj[key] = value;
    }
  }

  return { sanitized: sanitizedObj, requiredInputs, count: sanitizedCount };
}

/**
 * 脱敏配置对象
 * @param config 原始配置
 * @returns 脱敏结果
 */
export async function sanitizeConfig(config: any): Promise<SanitizeResult> {
  // 深拷贝配置，避免修改原始对象
  const configCopy = JSON.parse(JSON.stringify(config));

  const result = sanitizeObject(configCopy);

  return {
    sanitizedConfig: result.sanitized,
    requiredInputs: result.requiredInputs,
    sanitizedCount: result.count,
  };
}

/**
 * 填充敏感信息到配置中
 * @param config 预设配置（包含环境变量占位符）
 * @param inputs 用户输入的敏感信息
 * @returns 填充后的配置
 */
export function fillSensitiveInputs(config: any, inputs: Record<string, string>): any {
  const configCopy = JSON.parse(JSON.stringify(config));

  function fillObject(obj: any, path: string = ''): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) =>
        fillObject(item, path ? `${path}[${index}]` : `[${index}]`)
      );
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && isEnvPlaceholder(value)) {
        // 查找是否有用户输入
        const input = inputs[currentPath];
        if (input) {
          result[key] = input;
        } else {
          result[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = fillObject(value, currentPath);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  return fillObject(configCopy);
}
