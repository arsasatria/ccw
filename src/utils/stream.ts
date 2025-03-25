import { Response } from "express";
import { OpenAI } from "openai";

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: any;
  text?: string;
}

interface MessageEvent {
  type: string;
  message?: {
    id: string;
    type: string;
    role: string;
    content: any[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  delta?: {
    stop_reason?: string;
    stop_sequence?: string | null;
    content?: ContentBlock[];
    type?: string;
    text?: string;
    partial_json?: string;
  };
  index?: number;
  content_block?: ContentBlock;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export async function streamOpenAIResponse(
  res: Response,
  completion: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: string
) {
  const messageId = "msg_" + Date.now();
  let contentBlockIndex = 0;
  let currentContentBlocks: ContentBlock[] = [];

  // Send message_start event
  const messageStart: MessageEvent = {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
  res.write(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`);

  let isToolUse = false;
  let toolUseJson = "";
  let hasStartedTextBlock = false;

  try {
    for await (const chunk of completion) {
      const delta = chunk.choices[0].delta;

      if (delta.tool_calls && delta.tool_calls.length > 0) {
        const toolCall = delta.tool_calls[0];

        if (!isToolUse) {
          // Start new tool call block
          isToolUse = true;
          const toolBlock: ContentBlock = {
            type: "tool_use",
            id: `toolu_${Date.now()}`,
            name: toolCall.function?.name,
            input: {},
          };

          const toolBlockStart: MessageEvent = {
            type: "content_block_start",
            index: contentBlockIndex,
            content_block: toolBlock,
          };

          currentContentBlocks.push(toolBlock);

          res.write(
            `event: content_block_start\ndata: ${JSON.stringify(
              toolBlockStart
            )}\n\n`
          );
          toolUseJson = "";
        }

        // Stream tool call JSON
        if (toolCall.function?.arguments) {
          const jsonDelta: MessageEvent = {
            type: "content_block_delta",
            index: contentBlockIndex,
            delta: {
              type: "input_json_delta",
              partial_json: toolCall.function?.arguments,
            },
          };

          toolUseJson += toolCall.function.arguments;

          try {
            const parsedJson = JSON.parse(toolUseJson);
            currentContentBlocks[contentBlockIndex].input = parsedJson;
          } catch (e) {
            // JSON not yet complete, continue accumulating
          }

          res.write(
            `event: content_block_delta\ndata: ${JSON.stringify(jsonDelta)}\n\n`
          );
        }
      } else if (delta.content) {
        // Handle regular text content
        if (isToolUse) {
          // End previous tool call block
          const contentBlockStop: MessageEvent = {
            type: "content_block_stop",
            index: contentBlockIndex,
          };

          res.write(
            `event: content_block_stop\ndata: ${JSON.stringify(
              contentBlockStop
            )}\n\n`
          );
          contentBlockIndex++;
          isToolUse = false;
        }

        if (!delta.content) continue;

        // If text block not yet started, send content_block_start
        if (!hasStartedTextBlock) {
          const textBlock: ContentBlock = {
            type: "text",
            text: "",
          };

          const textBlockStart: MessageEvent = {
            type: "content_block_start",
            index: contentBlockIndex,
            content_block: textBlock,
          };

          currentContentBlocks.push(textBlock);

          res.write(
            `event: content_block_start\ndata: ${JSON.stringify(
              textBlockStart
            )}\n\n`
          );
          hasStartedTextBlock = true;
        }

        // Send regular text content
        const contentDelta: MessageEvent = {
          type: "content_block_delta",
          index: contentBlockIndex,
          delta: {
            type: "text_delta",
            text: delta.content,
          },
        };

        // Update content block text
        if (currentContentBlocks[contentBlockIndex]) {
          currentContentBlocks[contentBlockIndex].text += delta.content;
        }

        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify(
            contentDelta
          )}\n\n`
        );
      }
    }
  } catch (e: any) {
    // If text block not yet started, send content_block_start
    if (!hasStartedTextBlock) {
      const textBlock: ContentBlock = {
        type: "text",
        text: "",
      };

      const textBlockStart: MessageEvent = {
        type: "content_block_start",
        index: contentBlockIndex,
        content_block: textBlock,
      };

      currentContentBlocks.push(textBlock);

      res.write(
        `event: content_block_start\ndata: ${JSON.stringify(
          textBlockStart
        )}\n\n`
      );
      hasStartedTextBlock = true;
    }

    // Send regular text content
    const contentDelta: MessageEvent = {
      type: "content_block_delta",
      index: contentBlockIndex,
      delta: {
        type: "text_delta",
        text: JSON.stringify(e),
      },
    };

    // Update content block text
    if (currentContentBlocks[contentBlockIndex]) {
      currentContentBlocks[contentBlockIndex].text += JSON.stringify(e);
    }

    res.write(
      `event: content_block_delta\ndata: ${JSON.stringify(contentDelta)}\n\n`
    );
  }

  // Close last content block
  const contentBlockStop: MessageEvent = {
    type: "content_block_stop",
    index: contentBlockIndex,
  };

  res.write(
    `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`
  );

  // Send message_delta event with appropriate stop_reason
  const messageDelta: MessageEvent = {
    type: "message_delta",
    delta: {
      stop_reason: isToolUse ? "tool_use" : "end_turn",
      stop_sequence: null,
      content: currentContentBlocks,
    },
    usage: { input_tokens: 100, output_tokens: 150 },
  };

  res.write(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`);

  // Send message_stop event
  const messageStop: MessageEvent = {
    type: "message_stop",
  };

  res.write(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`);
  res.end();
}
