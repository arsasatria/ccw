import { FastifyPluginAsync } from 'fastify';

/**
 * Plugin configuration interface
 */
export interface CcwPluginOptions {
  enabled?: boolean;
  [key: string]: any;
}

/**
 * Plugin interface
 */
export interface CcwPlugin {
  name: string;
  version?: string;
  description?: string;
  register: FastifyPluginAsync<CcwPluginOptions>;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  enabled: boolean;
  options?: any;
}
