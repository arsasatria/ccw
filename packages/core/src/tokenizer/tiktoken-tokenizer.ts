import { get_encoding, Tiktoken } from "tiktoken";
import {
  ITokenizer,
  TokenizeRequest,
} from "../types/tokenizer";

/**
 * Tiktoken-based tokenizer implementation
 * Uses tiktoken library for fast token counting (OpenAI compatible)
 */
export class TiktokenTokenizer implements ITokenizer {
  readonly type = "tiktoken";
  readonly name: string;
  private encoding?: Tiktoken;
  private encodingName: string;

  constructor(encodingName: string = "cl100k_base") {
    this.encodingName = encodingName;
    this.name = `tiktoken-${encodingName}`;
    try {
      this.encoding = get_encoding(encodingName);
    } catch (error) {
      throw new Error(`Failed to initialize tiktoken encoding: ${encodingName}`);
    }
  }

  async initialize(): Promise<void> {
    // Encoding is already initialized in constructor
    if (!this.encoding) {
      throw new Error("Tiktoken encoding not initialized");
    }
  }

  async countTokens(request: TokenizeRequest): Promise<number> {
    if (!this.encoding) {
      throw new Error("Encoding not initialized");
    }

    let tokenCount = 0;
    const { messages, system, tools } = request;

    // Count messages
    if (Array.isArray(messages)) {
      messages.forEach((message) => {
        if (typeof message.content === "string") {
          tokenCount += this.encoding!.encode(message.content).length;
        } else if (Array.isArray(message.content)) {
          message.content.forEach((contentPart: any) => {
            if (contentPart.type === "text") {
              tokenCount += this.encoding!.encode(contentPart.text).length;
            } else if (contentPart.type === "tool_use") {
              tokenCount += this.encoding!.encode(
                JSON.stringify(contentPart.input)
              ).length;
            } else if (contentPart.type === "tool_result") {
              const content =
                typeof contentPart.content === "string"
                  ? contentPart.content
                  : JSON.stringify(contentPart.content);
              tokenCount += this.encoding!.encode(content).length;
            }
          });
        }
      });
    }

    // Count system
    if (typeof system === "string") {
      tokenCount += this.encoding.encode(system).length;
    } else if (Array.isArray(system)) {
      system.forEach((item: any) => {
        if (item.type !== "text") return;
        if (typeof item.text === "string") {
          tokenCount += this.encoding.encode(item.text).length;
        } else if (Array.isArray(item.text)) {
          item.text.forEach((textPart: any) => {
            tokenCount += this.encoding.encode(textPart || "").length;
          });
        }
      });
    }

    // Count tools
    if (tools) {
      tools.forEach((tool: any) => {
        if (tool.description) {
          tokenCount += this.encoding.encode(
            tool.name + tool.description
          ).length;
        }
        if (tool.input_schema) {
          tokenCount += this.encoding.encode(
            JSON.stringify(tool.input_schema)
          ).length;
        }
      });
    }

    return tokenCount;
  }

  isInitialized(): boolean {
    return this.encoding !== undefined;
  }

  dispose(): void {
    if (this.encoding) {
      this.encoding.free();
      this.encoding = undefined;
    }
  }
}
