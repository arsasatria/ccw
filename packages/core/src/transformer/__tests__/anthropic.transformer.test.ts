/**
 * Regression test for "API Error: Content block is not a text block"
 *
 * Reproduces the interleaved stream scenario from issue #1356 and #1371:
 *   text block → tool_use block → text block
 *
 * Before the fix, the second text block's `text_delta` would be emitted on
 * the tool_use block's index, causing the Anthropic SDK to throw.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AnthropicTransformer } from "../anthropic.transformer";

const logger = {
  debug: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
};

function buildReadableStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
}

interface AnthropicEvent {
  type: string;
  index?: number;
  content_block?: { type: string; [k: string]: any };
  delta?: { type: string; [k: string]: any };
}

async function collectEvents(response: Response): Promise<{ event: string; data: AnthropicEvent }[]> {
  if (!response.body) throw new Error("no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const out: { event: string; data: AnthropicEvent }[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const records = buf.split("\n\n");
    buf = records.pop() || "";
    for (const rec of records) {
      const lines = rec.split("\n").filter(Boolean);
      let event = "message";
      let data: AnthropicEvent | null = null;
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) {
          try {
            data = JSON.parse(line.slice(6).trim());
          } catch {
            // ignore non-JSON keepalives
          }
        }
      }
      if (data) out.push({ event, data });
    }
  }
  return out;
}

test("does not emit text_delta on a tool_use block when stream interleaves text + tool_use + text (issue #1356, #1371)", async () => {
  const upstreamChunks: string[] = [
    // chunk 1: text start
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Let me search for that..." },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    // chunk 2: text continuation
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [
        { index: 0, delta: { content: "\n\n" }, finish_reason: null },
      ],
    })}\n\n`,
    // chunk 3: tool_use opens
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_abc",
                function: { name: "search", arguments: "" },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    // chunk 4: tool_use arguments delta
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: '{"q":' } },
            ],
          },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    // chunk 5: tool_use more arguments
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: '"weather"}' } },
            ],
          },
          finish_reason: null,
        },
      ],
    })}\n\n`,
    // chunk 6: text AFTER tool_use (the buggy case)
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [
        { index: 0, delta: { content: "\nI found the results..." }, finish_reason: null },
      ],
    })}\n\n`,
    // chunk 7: finish
    `data: ${JSON.stringify({
      id: "cmpl-1",
      model: "test-model",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const upstream = buildReadableStreamFromChunks(upstreamChunks);
  const response = new Response(upstream, {
    headers: { "Content-Type": "text/event-stream" },
  });

  const transformer = new AnthropicTransformer();
  transformer.logger = logger;

  const out = await transformer.transformResponseIn(response, { req: { id: "test" } });
  const events = await collectEvents(out!);

  // Build a per-index map: which type was the block started as?
  const blockTypeByIndex = new Map<number, string>();
  for (const { data } of events) {
    if (data.type === "content_block_start" && typeof data.index === "number") {
      blockTypeByIndex.set(data.index, data.content_block?.type ?? "unknown");
    }
  }

  // For every text_delta, the block at that index must be a text block.
  const violations: string[] = [];
  for (const { data } of events) {
    if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
      const idx = data.index!;
      const blockType = blockTypeByIndex.get(idx);
      if (blockType !== "text") {
        violations.push(
          `text_delta emitted on index=${idx} (block_type=${blockType}) — this is the bug`,
        );
      }
    }
  }

  assert.deepEqual(violations, [], `stream events:\n${JSON.stringify(events, null, 2)}`);
});

test("backfills empty parameters for tools without input_schema (issue #1371 Bug 1)", () => {
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = transformer.convertAnthropicToolsToUnified([
    { name: "no_args_tool" }, // no input_schema
    { name: "with_schema", input_schema: { type: "object", properties: { x: { type: "string" } } } },
  ]);

  assert.deepEqual(out[0], {
    type: "function",
    function: {
      name: "no_args_tool",
      description: "",
      parameters: { type: "object", properties: {} },
    },
  });
  assert.deepEqual(out[1], {
    type: "function",
    function: {
      name: "with_schema",
      description: "",
      parameters: { type: "object", properties: { x: { type: "string" } } },
    },
  });
});
