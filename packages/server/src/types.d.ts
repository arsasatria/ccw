declare module "@musistudio/llms" {
  import { FastifyInstance } from "fastify";
  import { FastifyBaseLogger } from "fastify";

  export interface ServerConfig {
    jsonPath?: string;
    initialConfig?: any;
    logger?: any;
  }

  /**
   * Plugin configuration from config file
   */
  export interface PluginConfig {
    name: string;
    enabled?: boolean;
    options?: Record<string, any>;
  }

  export interface Server {
    app: FastifyInstance;
    logger: FastifyBaseLogger;
    start(): Promise<void>;
  }

  const Server: {
    new (config: ServerConfig): Server;
  };

  export default Server;

  // Export cache
  export interface Usage {
    input_tokens: number;
    output_tokens: number;
  }

  export const sessionUsageCache: any;

  // Export router
  export interface RouterContext {
    configService: any;
    event?: any;
  }

  export const router: (req: any, res: any, context: RouterContext) => Promise<void>;

  // Export utilities
  export const calculateTokenCount: (messages: any[], system: any, tools: any[]) => number;
  export const searchProjectBySession: (sessionId: string) => Promise<string | null>;

  // Export services
  export class ConfigService {
    constructor(options?: any);
    get<T = any>(key: string): T | undefined;
    get<T = any>(key: string, defaultValue: T): T;
    getAll(): any;
    has(key: string): boolean;
    set(key: string, value: any): void;
    reload(): void;
  }

  export class ProviderService {
    constructor(configService: any, transformerService: any, logger: any);
  }

  export class TransformerService {
    constructor(configService: any, logger: any);
    initialize(): Promise<void>;
  }
}
