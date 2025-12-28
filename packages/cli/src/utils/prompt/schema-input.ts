/**
 * 动态配置 CLI 交互处理器
 * 处理各种输入类型的用户交互
 */

import {
  RequiredInput,
  InputType,
  UserInputValues,
  PresetConfigSection,
  shouldShowField,
  resolveOptions,
  validateInput,
  getDefaultValue,
  sortFieldsByDependencies,
  getAffectedFields,
} from '@arsasatria/ccw-shared';
import { input, confirm, select, password } from '@inquirer/prompts';

// ANSI 颜色代码
export const COLORS = {
  RESET: "\x1B[0m",
  GREEN: "\x1B[32m",
  YELLOW: "\x1B[33m",
  BOLDYELLOW: "\x1B[1m\x1B[33m",
  BOLDCYAN: "\x1B[1m\x1B[36m",
  DIM: "\x1B[2m",
  BOLDGREEN: "\x1B[1m\x1B[32m",
};

/**
 * 收集用户输入（支持动态配置）
 */
export async function collectUserInputs(
  schema: RequiredInput[],
  presetConfig: PresetConfigSection,
  existingValues?: UserInputValues
): Promise<UserInputValues> {
  // 按依赖关系排序
  const sortedFields = sortFieldsByDependencies(schema);

  // 初始化值
  const values: UserInputValues = { ...existingValues };

  // 收集所有输入
  for (const field of sortedFields) {
    // 检查是否应该显示此字段
    if (!shouldShowField(field, values)) {
      // 跳过，并清除该字段的值（如果之前存在）
      delete values[field.id];
      continue;
    }

    // 如果已有值且不是初始收集，跳过
    if (existingValues && field.id in existingValues) {
      continue;
    }

    // 获取输入值
    const value = await promptField(field, presetConfig, values);

    // 验证
    const validation = validateInput(field, value);
    if (!validation.valid) {
      console.error(`${COLORS.YELLOW}Error:${COLORS.RESET} ${validation.error}`);
      // 对于必填字段，抛出错误
      if (field.required !== false) {
        throw new Error(validation.error);
      }
    }

    values[field.id] = value;
    console.log('');
  }

  return values;
}

/**
 * 重新收集受影响的字段（当某个字段值变化时）
 */
export async function recollectAffectedFields(
  changedFieldId: string,
  schema: RequiredInput[],
  presetConfig: PresetConfigSection,
  currentValues: UserInputValues
): Promise<UserInputValues> {
  const affectedFields = getAffectedFields(changedFieldId, schema);
  const sortedFields = sortFieldsByDependencies(schema);

  const values = { ...currentValues };

  // 对受影响的字段重新收集输入
  for (const fieldId of affectedFields) {
    const field = sortedFields.find(f => f.id === fieldId);
    if (!field) {
      continue;
    }

    // 检查是否应该显示
    if (!shouldShowField(field, values)) {
      delete values[field.id];
      continue;
    }

    // 重新收集输入
    const value = await promptField(field, presetConfig, values);
    values[field.id] = value;

    // 级联更新：如果这个字段的变化又影响了其他字段
    const newAffected = getAffectedFields(field.id, schema);
    for (const newAffectedId of newAffected) {
      if (!affectedFields.has(newAffectedId)) {
        affectedFields.add(newAffectedId);
      }
    }
  }

  return values;
}

/**
 * 提示单个字段
 */
async function promptField(
  field: RequiredInput,
  presetConfig: PresetConfigSection,
  currentValues: UserInputValues
): Promise<any> {
  const label = field.label || field.id;
  const message = field.prompt || `${label}:`;

  switch (field.type) {
    case InputType.PASSWORD:
      return await password({
        message,
        mask: '*',
      });

    case InputType.INPUT:
      return await input({
        message,
        default: field.defaultValue,
      });

    case InputType.NUMBER:
      const numStr = await input({
        message,
        default: String(field.defaultValue ?? 0),
      });
      return Number(numStr);

    case InputType.CONFIRM:
      return await confirm({
        message,
        default: field.defaultValue ?? false,
      });

    case InputType.SELECT: {
      const options = resolveOptions(field, presetConfig, currentValues);
      if (options.length === 0) {
        console.warn(`${COLORS.YELLOW}Warning:${COLORS.RESET} No options available for ${label}`);
        return field.defaultValue;
      }

      return await select({
        message,
        choices: options.map(opt => ({
          name: opt.label,
          value: opt.value,
          description: opt.description,
          disabled: opt.disabled,
        })),
        default: field.defaultValue,
      });
    }

    case InputType.MULTISELECT: {
      const options = resolveOptions(field, presetConfig, currentValues);
      if (options.length === 0) {
        console.warn(`${COLORS.YELLOW}Warning:${COLORS.RESET} No options available for ${label}`);
        return field.defaultValue ?? [];
      }

      // @inquirer/prompts 没有多选，使用 checkbox
      const { checkbox } = await import('@inquirer/prompts');
      return await checkbox({
        message,
        choices: options.map(opt => ({
          name: opt.label,
          value: opt.value,
          checked: Array.isArray(field.defaultValue) && field.defaultValue.includes(opt.value),
        })),
      });
    }

    case InputType.EDITOR: {
      const { editor } = await import('@inquirer/prompts');
      return await editor({
        message,
        default: field.defaultValue,
      });
    }

    default:
      // 默认使用 input
      return await input({
        message,
        default: field.defaultValue,
      });
  }
}

/**
 * 收集敏感信息（兼容旧版）
 */
export async function collectSensitiveInputs(
  schema: RequiredInput[],
  presetConfig: PresetConfigSection,
  existingValues?: UserInputValues
): Promise<UserInputValues> {
  console.log(`\n${COLORS.BOLDYELLOW}This preset requires additional information:${COLORS.RESET}\n`);

  const values = await collectUserInputs(schema, presetConfig, existingValues);

  // 显示摘要
  console.log(`${COLORS.GREEN}✓${COLORS.RESET} All required information collected\n`);

  return values;
}
