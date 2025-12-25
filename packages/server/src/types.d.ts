declare module "@musistudio/llms" {
  import { FastifyInstance } from "fastify";

  export interface ServerConfig {
    jsonPath?: string;
    initialConfig?: any;
    logger?: any;
  }

  export interface Server {
    app: FastifyInstance;
    logger: any;
    start(): Promise<void>;
  }

  const Server: {
    new (config: ServerConfig): Server;
  };

  export default Server;
}
