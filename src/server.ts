import express, { RequestHandler } from "express";
import {
  ContentBlockParam,
  MessageCreateParamsBase,
} from "@anthropic-ai/sdk/resources/messages";
import { OpenAI } from "openai";
import { Router } from "./deepseek";
import { getOpenAICommonOptions } from "./utils";
import { streamOpenAIResponse } from "./utils/stream";

interface Client {
  call: (
    data: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ) => Promise<any>;
}

interface Server {
  app: express.Application;
  useMiddleware: (middleware: RequestHandler) => void;
  start: () => void;
}

export const createServer = (port: number): Server => {
  const app = express();
  app.use(express.json({ limit: "500mb" }));

  let client: Client;
  if (process.env.ENABLE_ROUTER && process.env.ENABLE_ROUTER === "true") {
    const router = new Router();
    client = {
      call: (data) => {
        return router.route(data);
      },
    };
  } else {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      ...getOpenAICommonOptions(),
    });
    client = {
      call: (data) => {
        if (process.env.OPENAI_MODEL) {
          data.model = process.env.OPENAI_MODEL;
        }
        return openai.chat.completions.create(data);
      },
    };
  }

  app.post("/v1/messages", async (req, res) => {
    try {
      let {
        model,
        max_tokens,
        messages,
        system = [],
        temperature,
        metadata,
        tools,
      }: MessageCreateParamsBase = req.body;

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
      try {
        const completion = await client.call(data);
        await streamOpenAIResponse(res, completion, model);
      } catch (e) {
        console.error("Error in OpenAI API call:", e);
      }
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
      await streamOpenAIResponse(res, errorCompletion, "gpt-3.5-turbo");
    }
  });

  return {
    app,
    useMiddleware: (middleware: RequestHandler) => {
      app.use("/v1/messages", middleware);
    },
    start: () => {
      app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });
    },
  };
};
