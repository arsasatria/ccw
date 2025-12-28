/**
 * 配置合并策略
 */

import { MergeStrategy, ProviderConfig, RouterConfig, TransformerConfig } from './types';

/**
 * 合并 Provider 配置
 * 如果 provider 已存在则直接覆盖，否则添加
 */
function mergeProviders(
  existing: ProviderConfig[],
  incoming: ProviderConfig[]
): ProviderConfig[] {
  const result = [...existing];
  const existingNames = new Map(existing.map(p => [p.name, result.findIndex(x => x.name === p.name)]));

  for (const provider of incoming) {
    const existingIndex = existingNames.get(provider.name);
    if (existingIndex !== undefined) {
      // Provider 已存在，直接覆盖
      result[existingIndex] = provider;
    } else {
      // 新 Provider，直接添加
      result.push(provider);
    }
  }

  return result;
}

/**
 * 合并 Router 配置
 */
async function mergeRouter(
  existing: RouterConfig,
  incoming: RouterConfig,
  strategy: MergeStrategy,
  onRouterConflict?: (key: string, existingValue: any, newValue: any) => Promise<boolean>
): Promise<RouterConfig> {
  const result = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) {
      continue;
    }

    const existingValue = result[key];

    if (existingValue === undefined || existingValue === null) {
      // 现有配置中没有这个路由规则，直接添加
      result[key] = value;
    } else {
      // 存在冲突
      if (strategy === MergeStrategy.ASK && onRouterConflict) {
        const shouldOverwrite = await onRouterConflict(key, existingValue, value);
        if (shouldOverwrite) {
          result[key] = value;
        }
      } else if (strategy === MergeStrategy.OVERWRITE) {
        result[key] = value;
      } else if (strategy === MergeStrategy.MERGE) {
        // 对于 Router，merge 策略等同于 skip，保留现有值
        // 或者可以询问用户
      }
      // skip 策略：保留现有值，不做任何操作
    }
  }

  return result;
}

/**
 * 合并 Transformer 配置
 */
async function mergeTransformers(
  existing: TransformerConfig[],
  incoming: TransformerConfig[],
  strategy: MergeStrategy,
  onTransformerConflict?: (transformerPath: string) => Promise<'keep' | 'overwrite' | 'skip'>
): Promise<TransformerConfig[]> {
  if (!existing || existing.length === 0) {
    return incoming;
  }

  if (!incoming || incoming.length === 0) {
    return existing;
  }

  // Transformer 合并逻辑：按路径匹配
  const result = [...existing];
  const existingPaths = new Set(existing.map(t => t.path));

  for (const transformer of incoming) {
    if (!transformer.path) {
      // 没有 path 的 transformer，直接添加
      result.push(transformer);
      continue;
    }

    if (existingPaths.has(transformer.path)) {
      // 已存在相同 path 的 transformer
      if (strategy === MergeStrategy.ASK && onTransformerConflict) {
        const action = await onTransformerConflict(transformer.path);
        if (action === 'overwrite') {
          const index = result.findIndex(t => t.path === transformer.path);
          result[index] = transformer;
        }
        // keep 和 skip 都不做操作
      } else if (strategy === MergeStrategy.OVERWRITE) {
        const index = result.findIndex(t => t.path === transformer.path);
        result[index] = transformer;
      }
      // merge 和 skip 策略：保留现有
    } else {
      // 新 transformer，直接添加
      result.push(transformer);
    }
  }

  return result;
}

/**
 * 合并其他顶级配置
 */
async function mergeOtherConfig(
  existing: any,
  incoming: any,
  strategy: MergeStrategy,
  onConfigConflict?: (key: string) => Promise<boolean>,
  excludeKeys: string[] = ['Providers', 'Router', 'transformers']
): Promise<any> {
  const result = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (excludeKeys.includes(key)) {
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const existingValue = result[key];

    if (existingValue === undefined || existingValue === null) {
      // 现有配置中没有这个字段，直接添加
      result[key] = value;
    } else {
      // 存在冲突
      if (strategy === MergeStrategy.ASK && onConfigConflict) {
        const shouldOverwrite = await onConfigConflict(key);
        if (shouldOverwrite) {
          result[key] = value;
        }
      } else if (strategy === MergeStrategy.OVERWRITE) {
        result[key] = value;
      }
      // merge 和 skip 策略：保留现有值
    }
  }

  return result;
}

/**
 * 合并交互回调接口
 */
export interface MergeCallbacks {
  onRouterConflict?: (key: string, existingValue: any, newValue: any) => Promise<boolean>;
  onTransformerConflict?: (transformerPath: string) => Promise<'keep' | 'overwrite' | 'skip'>;
  onConfigConflict?: (key: string) => Promise<boolean>;
}

/**
 * 主配置合并函数
 * @param baseConfig 基础配置（现有配置）
 * @param presetConfig 预设配置
 * @param strategy 合并策略
 * @param callbacks 交互式回调函数
 * @returns 合并后的配置
 */
export async function mergeConfig(
  baseConfig: any,
  presetConfig: any,
  strategy: MergeStrategy = MergeStrategy.ASK,
  callbacks?: MergeCallbacks
): Promise<any> {
  const result = { ...baseConfig };

  // 合并 Providers
  if (presetConfig.Providers) {
    result.Providers = mergeProviders(
      result.Providers || [],
      presetConfig.Providers
    );
  }

  // 合并 Router
  if (presetConfig.Router) {
    result.Router = await mergeRouter(
      result.Router || {},
      presetConfig.Router,
      strategy,
      callbacks?.onRouterConflict
    );
  }

  // 合并 transformers
  if (presetConfig.transformers) {
    result.transformers = await mergeTransformers(
      result.transformers || [],
      presetConfig.transformers,
      strategy,
      callbacks?.onTransformerConflict
    );
  }

  // 合并其他配置
  const otherConfig = await mergeOtherConfig(
    result,
    presetConfig,
    strategy,
    callbacks?.onConfigConflict
  );

  return otherConfig;
}
