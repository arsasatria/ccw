import { Request, Response, NextFunction } from "express";
import { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages";
import OpenAI from "openai";
import { streamOpenAIResponse } from "../utils/stream";

export const formatRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let {
    model,
    max_tokens,
    messages,
    system = [],
    temperature,
    metadata,
    tools,
  }: MessageCreateParamsBase = req.body;
  try {
    const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      messages.map((item) => {
        if (item.content instanceof Array) {
          return {
            role: item.role,
            content: item.content
              .map((it: ContentBlockParam) => {
                if (it.type === "text") {
                  return typeof it.text === "string"
                    ? it.text
                    : JSON.stringify(it);
                }
                return JSON.stringify(it);
              })
              .join(""),
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        }
        return {
          role: item.role,
          content:
            typeof item.content === "string"
              ? item.content
              : JSON.stringify(item.content),
        };
      });
    const systemMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      Array.isArray(system)
        ? system.map((item) => ({
            role: "system",
            content: item.text,
          }))
        : [{ role: "system", content: system }];
    const data: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model,
      messages: [...systemMessages, ...openAIMessages],
      temperature,
      stream: true,
    };
    if (tools) {
      data.tools = tools
        .filter((tool) => !["StickerRequest"].includes(tool.name))
        .map((item: any) => ({
          type: "function",
          function: {
            name: item.name,
            description: item.description,
            parameters: item.input_schema,
          },
        }));
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    req.body = data;
  } catch (error) {
    console.error("Error in request processing:", error);
    const errorCompletion: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> =
      {
        async *[Symbol.asyncIterator]() {
          yield {
            id: `error_${Date.now()}`,
            created: Math.floor(Date.now() / 1000),
            model: "gpt-3.5-turbo",
            object: "chat.completion.chunk",
            choices: [
              {
                index: 0,
                delta: {
                  content: `Error: ${(error as Error).message}`,
                },
                finish_reason: "stop",
              },
            ],
          };
        },
      };
    await streamOpenAIResponse(res, errorCompletion, model);
  }
  next();
};
