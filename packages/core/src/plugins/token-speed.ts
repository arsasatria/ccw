import fp from 'fastify-plugin';
import { CCRPlugin, CCRPluginOptions } from './types';
import { SSEParserTransform } from '../utils/sse';
import { Tiktoken } from 'tiktoken';
import { OutputHandlerConfig, OutputOptions, outputManager } from './output';

/**
 * Token statistics interface
 */
interface TokenStats {
  requestId: string;
  startTime: number;
  firstTokenTime?: number;
  lastTokenTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  timeToFirstToken?: number;
  contentBlocks: {
    index: number;
    tokenCount: number;
    speed: number;
  }[];
}

/**
 * Plugin options
 */
interface TokenSpeedOptions extends CCRPluginOptions {
  logInterval?: number; // Log every N tokens
  enableCrossRequestStats?: boolean; // Enable cross-request statistics
  statsWindow?: number; // Statistics window size (last N requests)

  /**
   * Output handler configurations
   * Supports console, webhook, and other output handlers
   */
  outputHandlers?: OutputHandlerConfig[];

  /**
   * Default output options (format, prefix, etc.)
   */
  outputOptions?: OutputOptions;
}

// Store request-level statistics
const requestStats = new Map<string, TokenStats>();

// Cross-request statistics
const globalStats = {
  totalRequests: 0,
  totalTokens: 0,
  totalTime: 0,
  avgTokensPerSecond: 0,
  minTokensPerSecond: Infinity,
  maxTokensPerSecond: 0,
  avgTimeToFirstToken: 0,
  allSpeeds: [] as number[] // Used for calculating percentiles
};

/**
 * Token speed measurement plugin
 */
export const tokenSpeedPlugin: CCRPlugin = {
  name: 'token-speed',
  version: '1.0.0',
  description: 'Statistics for streaming response token generation speed',

  // Use fp() to break encapsulation and apply hooks globally
  register: fp(async (fastify, options: TokenSpeedOptions) => {
    const opts = {
      logInterval: 10,
      enableCrossRequestStats: true,
      statsWindow: 100,
      ...options
    };

    // Initialize output handlers
    if (opts.outputHandlers && opts.outputHandlers.length > 0) {
      outputManager.registerHandlers(opts.outputHandlers);
    } else {
      // Default to console output if no handlers configured
      outputManager.registerHandlers([{
        type: 'console',
        enabled: true,
        config: {
          colors: true,
          level: 'log'
        }
      }]);
    }

    // Set default output options
    if (opts.outputOptions) {
      outputManager.setDefaultOptions(opts.outputOptions);
    }

    // Initialize tiktoken encoder
    let encoding: Tiktoken | null = null;
    try {
      const { get_encoding } = await import('tiktoken');
      encoding = get_encoding('cl100k_base');
    } catch (error) {
      fastify.log?.warn('Failed to load tiktoken, falling back to estimation');
    }

    // Add onSend hook to intercept streaming responses
    fastify.addHook('onSend', async (request, reply, payload) => {
      // Only handle streaming responses
      if (!(payload instanceof ReadableStream)) {
        return payload;
      }

      const requestId = (request as any).id || Date.now().toString();
      const startTime = Date.now();

      // Initialize statistics
      requestStats.set(requestId, {
        requestId,
        startTime,
        lastTokenTime: startTime,
        tokenCount: 0,
        tokensPerSecond: 0,
        contentBlocks: []
      });
      // Tee the stream: one for stats, one for the client
      const [originalStream, statsStream] = payload.tee();

      // Process stats in background
      const processStats = async () => {
        let currentBlockIndex = -1;
        let blockStartTime = 0;
        let blockTokenCount = 0;

        try {
          // Decode byte stream to text, then parse SSE events
          const eventStream = statsStream
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new SSEParserTransform());
          const reader = eventStream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const data = value;
            const stats = requestStats.get(requestId);
            if (!stats) continue;

            // Detect content_block_start event
            if (data.event === 'content_block_start' && data.data?.content_block?.type === 'text') {
              currentBlockIndex = data.data.index;
              blockStartTime = Date.now();
              blockTokenCount = 0;
            }

            // Detect content_block_delta event (incremental tokens)
            if (data.event === 'content_block_delta' && data.data?.delta?.type === 'text_delta') {
              const text = data.data.delta.text;
              const tokenCount = encoding
                ? encoding.encode(text).length
                : estimateTokens(text);

              stats.tokenCount += tokenCount;
              stats.lastTokenTime = Date.now();

              // Record first token time
              if (!stats.firstTokenTime) {
                stats.firstTokenTime = stats.lastTokenTime;
                stats.timeToFirstToken = stats.firstTokenTime - stats.startTime;
              }

              // Calculate current block token count
              if (currentBlockIndex >= 0) {
                blockTokenCount += tokenCount;
              }

              // Calculate speed
              const elapsed = (stats.lastTokenTime - stats.startTime) / 1000;
              stats.tokensPerSecond = stats.tokenCount / elapsed;

              // Log periodically
              if (stats.tokenCount % opts.logInterval === 0) {
                await outputStats(stats, opts.outputOptions);
              }
            }

            // Detect content_block_stop event
            if (data.event === 'content_block_stop' && currentBlockIndex >= 0) {
              const blockElapsed = (Date.now() - blockStartTime) / 1000;
              const blockSpeed = blockElapsed > 0 ? blockTokenCount / blockElapsed : 0;

              stats.contentBlocks.push({
                index: currentBlockIndex,
                tokenCount: blockTokenCount,
                speed: blockSpeed
              });

              currentBlockIndex = -1;
            }

            // Output final statistics when message ends
            if (data.event === 'message_stop') {
              // Update global statistics
              if (opts.enableCrossRequestStats) {
                updateGlobalStats(stats, opts.statsWindow);
              }

              await outputStats(stats, opts.outputOptions, true);

              if (opts.enableCrossRequestStats) {
                await outputGlobalStats(opts.outputOptions);
              }

              requestStats.delete(requestId);
            }
          }
        } catch (error: any) {
          console.error(error);
          if (error.name !== 'AbortError' && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            fastify.log?.warn(`Error processing token stats: ${error.message}`);
          }
        }
      };

      // Start background processing without blocking
      processStats().catch((error) => {
        console.log(error);
        fastify.log?.warn(`Background stats processing failed: ${error.message}`);
      });

      // Return original stream to client
      return originalStream;
    });
  }),
};

/**
 * Update global statistics
 */
function updateGlobalStats(stats: TokenStats, windowSize: number) {
  globalStats.totalRequests++;
  globalStats.totalTokens += stats.tokenCount;
  globalStats.totalTime += (stats.lastTokenTime - stats.startTime) / 1000;

  if (stats.tokensPerSecond < globalStats.minTokensPerSecond) {
    globalStats.minTokensPerSecond = stats.tokensPerSecond;
  }
  if (stats.tokensPerSecond > globalStats.maxTokensPerSecond) {
    globalStats.maxTokensPerSecond = stats.tokensPerSecond;
  }

  if (stats.timeToFirstToken) {
    globalStats.avgTimeToFirstToken =
      (globalStats.avgTimeToFirstToken * (globalStats.totalRequests - 1) + stats.timeToFirstToken) /
      globalStats.totalRequests;
  }

  globalStats.allSpeeds.push(stats.tokensPerSecond);

  // Maintain window size
  if (globalStats.allSpeeds.length > windowSize) {
    globalStats.allSpeeds.shift();
  }

  globalStats.avgTokensPerSecond = globalStats.totalTokens / globalStats.totalTime;
}

/**
 * Calculate percentile
 */
function calculatePercentile(data: number[], percentile: number): number {
  if (data.length === 0) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Estimate token count (fallback method)
 */
function estimateTokens(text: string): number {
  // Rough estimation: English ~4 chars/token, Chinese ~1.5 chars/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * Output single request statistics
 */
async function outputStats(stats: TokenStats, options?: OutputOptions, isFinal = false) {
  const prefix = isFinal ? '[Token Speed Final]' : '[Token Speed]';

  // Calculate average speed of each block
  const avgBlockSpeed = stats.contentBlocks.length > 0
    ? stats.contentBlocks.reduce((sum, b) => sum + b.speed, 0) / stats.contentBlocks.length
    : 0;

  const logData = {
    requestId: stats.requestId.substring(0, 8),
    tokenCount: stats.tokenCount,
    tokensPerSecond: stats.tokensPerSecond.toFixed(2),
    timeToFirstToken: stats.timeToFirstToken ? `${stats.timeToFirstToken}ms` : 'N/A',
    duration: `${((stats.lastTokenTime - stats.startTime) / 1000).toFixed(2)}s`,
    contentBlocks: stats.contentBlocks.length,
    avgBlockSpeed: avgBlockSpeed.toFixed(2),
    ...(isFinal && stats.contentBlocks.length > 1 ? {
      blocks: stats.contentBlocks.map(b => ({
        index: b.index,
        tokenCount: b.tokenCount,
        speed: b.speed.toFixed(2)
      }))
    } : {})
  };

  // Output through output manager
  await outputManager.output(logData, {
    prefix,
    ...options
  });
}

/**
 * Output global statistics
 */
async function outputGlobalStats(options?: OutputOptions) {
  const p50 = calculatePercentile(globalStats.allSpeeds, 50);
  const p95 = calculatePercentile(globalStats.allSpeeds, 95);
  const p99 = calculatePercentile(globalStats.allSpeeds, 99);

  const logData = {
    totalRequests: globalStats.totalRequests,
    totalTokens: globalStats.totalTokens,
    avgTokensPerSecond: globalStats.avgTokensPerSecond.toFixed(2),
    minSpeed: globalStats.minTokensPerSecond === Infinity ? 0 : globalStats.minTokensPerSecond.toFixed(2),
    maxSpeed: globalStats.maxTokensPerSecond.toFixed(2),
    avgTimeToFirstToken: `${globalStats.avgTimeToFirstToken.toFixed(0)}ms`,
    percentiles: {
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2)
    }
  };

  // Output through output manager
  await outputManager.output(logData, {
    prefix: '[Token Speed Global Stats]',
    ...options
  });
}
