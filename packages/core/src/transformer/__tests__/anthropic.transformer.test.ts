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

test("does not emit thinking_delta on a text block when stream interleaves thinking + text + thinking", async () => {
  // Bug: the transformer tracked "are we in a thinking block" with a separate
  // isThinkingStarted flag that was only ever set to true. After a thinking
  // block closed (via signature) and a text block opened, a follow-up
  // thinking chunk would skip content_block_start and emit thinking_delta
  // on the text block's index — the SDK then rejects it.
  const upstreamChunks: string[] = [
    // chunk 1: text
    `data: ${JSON.stringify({
      id: "cmpl-2", model: "test-model",
      choices: [{ index: 0, delta: { role: "assistant", content: "answer" }, finish_reason: null }],
    })}\n\n`,
    // chunk 2: thinking with signature (closes the thinking block)
    `data: ${JSON.stringify({
      id: "cmpl-2", model: "test-model",
      choices: [{ index: 0, delta: { thinking: { signature: "sig-1" } }, finish_reason: null }],
    })}\n\n`,
    // chunk 3: more text
    `data: ${JSON.stringify({
      id: "cmpl-2", model: "test-model",
      choices: [{ index: 0, delta: { content: " — done" }, finish_reason: null }],
    })}\n\n`,
    // chunk 4: thinking content again (this is the buggy case)
    `data: ${JSON.stringify({
      id: "cmpl-2", model: "test-model",
      choices: [{ index: 0, delta: { thinking: { content: "follow-up thought" } }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "cmpl-2", model: "test-model",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
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

  const blockTypeByIndex = new Map<number, string>();
  for (const { data } of events) {
    if (data.type === "content_block_start" && typeof data.index === "number") {
      blockTypeByIndex.set(data.index, data.content_block?.type ?? "unknown");
    }
  }

  const violations: string[] = [];
  for (const { data } of events) {
    if (data.type === "content_block_delta" && data.delta?.type === "thinking_delta") {
      const idx = data.index!;
      const blockType = blockTypeByIndex.get(idx);
      if (blockType !== "thinking") {
        violations.push(
          `thinking_delta emitted on index=${idx} (block_type=${blockType}) — should be on a thinking block`,
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

test("sets assistant content to null when text+tool_use+thinking are all empty (sanitize context histories)", async () => {
  // Reproduces: a previous turn where the model emitted only a thinking block
  // (no text, no tool_use) and the empty {"type":"text","text":""} part is
  // sent back as part of the assistant history. After filtering empties, the
  // assistant message has no text, no tool_calls, no thinking — must be
  // serialized with content: null so strict OpenAI-spec providers don't
  // reject an empty-string content field.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "" }, // empty — must be filtered
          { type: "thinking", thinking: "hmm", signature: "sig" },
        ],
      },
    ],
  });

  // content should be null (not "") because textParts was empty
  assert.equal(out.messages[0].content, null);
  // thinking should be preserved
  assert.deepEqual(out.messages[0].thinking, { content: "hmm", signature: "sig" });
});

test("joins non-empty assistant text parts and preserves tool_calls and thinking", async () => {
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "" }, // empty — must be filtered
          { type: "text", text: "second" },
          { type: "tool_use", id: "t1", name: "search", input: { q: "x" } },
          { type: "thinking", thinking: "reasoning", signature: "sig-1" },
        ],
      },
    ],
  });

  assert.equal(out.messages[0].content, "first\nsecond");
  assert.deepEqual(out.messages[0].tool_calls, [
    { id: "t1", type: "function", function: { name: "search", arguments: '{"q":"x"}' } },
  ]);
  assert.deepEqual(out.messages[0].thinking, { content: "reasoning", signature: "sig-1" });
});

test("captures usage when finish_reason and usage arrive in the same stream chunk (issue #1422)", async () => {
  // Real OpenAI behavior: when stream_options.include_usage is true, OpenAI
  // sends the usage chunk in the SSE response after the finish_reason chunk.
  // They often arrive in the same ReadableStream read, so they share a buffer.
  //
  // Before the fix, the finish_reason branch `break`ed out of the line loop,
  // dropping the trailing usage chunk from the same buffer. Result: the
  // Anthropic-formatted `message_delta` was emitted with usage = 0,0, which
  // prevents Claude Code from triggering context compression.
  const textChunk = `data: ${JSON.stringify({
    id: "cmpl-u", model: "test-model",
    choices: [{ index: 0, delta: { role: "assistant", content: "hi" }, finish_reason: null }],
  })}\n\n`;
  const finishReasonLine = `data: ${JSON.stringify({
    id: "cmpl-u", model: "test-model",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\n`;
  const usageLine = `data: ${JSON.stringify({
    id: "cmpl-u", model: "test-model",
    choices: [],
    usage: {
      prompt_tokens: 1234,
      completion_tokens: 56,
      prompt_tokens_details: { cached_tokens: 7 },
    },
  })}\n\n`;
  const doneLine = `data: [DONE]\n\n`;

  // First push a small content chunk, then a SINGLE buffer holding the
  // finish_reason + usage + [DONE] all at once. This is what we get from
  // OpenAI in the common case.
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(textChunk));
      controller.enqueue(enc.encode(finishReasonLine + usageLine + doneLine));
      controller.close();
    },
  });

  const response = new Response(upstream, {
    headers: { "Content-Type": "text/event-stream" },
  });

  const transformer = new AnthropicTransformer();
  transformer.logger = logger;
  const out = await transformer.transformResponseIn(response, { req: { id: "test" } });
  const events = await collectEvents(out!);

  // Find the message_delta event and inspect its usage.
  const messageDelta = events.find((e) => e.data.type === "message_delta");
  assert.ok(messageDelta, "expected a message_delta event in the stream");

  const usage = (messageDelta.data as any).usage;
  assert.ok(usage, `expected message_delta to carry usage, got: ${JSON.stringify(messageDelta.data)}`);
  assert.equal(
    usage.input_tokens,
    1234 - 7,
    "input_tokens should be prompt_tokens - cached_tokens",
  );
  assert.equal(usage.output_tokens, 56, "output_tokens should be completion_tokens");
  assert.equal(usage.cache_read_input_tokens, 7, "cache_read_input_tokens should be cached_tokens");
});

test("coerces empty-string assistant content to null (issue #1329 Bedrock)", async () => {
  // AWS Bedrock rejects `messages: text content blocks must be non-empty`
  // when the assistant message has `content: ""` alongside `tool_calls`.
  // The transformer's job is to normalize empty string content to null so
  // the field is absent at serialization.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      {
        role: "user",
        content: "What's the weather in Paris?",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "t1",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"Paris"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "t1",
        content: "72F, sunny",
      },
    ],
  });

  assert.equal(
    out.messages[1].content,
    null,
    "empty-string assistant content must be coerced to null for Bedrock compatibility",
  );
  assert.deepEqual(out.messages[1].tool_calls, [
    { id: "t1", type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } },
  ]);
});


test("DeepSeek V4 flow: thinking → text → tool_use → text → finish keeps every block's type aligned (issue #1355)", async () => {
  // Repro of issue #1355: CCR proxying DeepSeek V4 with thinking enabled
  // throws "Content block is not a text block". The interleaving here is the
  // full DeepSeek R1/V4 pattern: the model emits a thinking block, then text
  // (often the explanation), then a tool_use, then more text after the tool
  // returns, then finish. Each transition must close the prior block and open
  // a new one of the correct type before the next delta.
  const upstreamChunks: string[] = [
    // initial role
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    })}\n\n`,
    // thinking content
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: { thinking: { content: "I need to search" } }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: { thinking: { content: " for that" } }, finish_reason: null }],
    })}\n\n`,
    // thinking signature closes the thinking block
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: { thinking: { signature: "sig-ds" } }, finish_reason: null }],
    })}\n\n`,
    // text right after thinking
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: { content: "Let me search" }, finish_reason: null }],
    })}\n\n`,
    // tool_use opens
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: "call_ds", function: { name: "search", arguments: "" } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":"x"}' } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    // text after tool_use
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: { content: " here it is" }, finish_reason: null }],
    })}\n\n`,
    // finish
    `data: ${JSON.stringify({
      id: "cmpl-ds", model: "deepseek-v4",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const upstream = buildReadableStreamFromChunks(upstreamChunks);
  const response = new Response(upstream, { headers: { "Content-Type": "text/event-stream" } });
  const transformer = new AnthropicTransformer();
  transformer.logger = logger;
  const out = await transformer.transformResponseIn(response, { req: { id: "test" } });
  const events = await collectEvents(out!);

  const blockTypeByIndex = new Map<number, string>();
  for (const { data } of events) {
    if (data.type === "content_block_start" && typeof data.index === "number") {
      blockTypeByIndex.set(data.index, data.content_block?.type ?? "unknown");
    }
  }

  // Verify every text_delta is on a text block and every thinking_delta is on a thinking block
  const violations: string[] = [];
  for (const { data } of events) {
    if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
      const blockType = blockTypeByIndex.get(data.index!);
      if (blockType !== "text") {
        violations.push(`text_delta on index=${data.index} (block_type=${blockType})`);
      }
    }
    if (data.type === "content_block_delta" && data.delta?.type === "thinking_delta") {
      const blockType = blockTypeByIndex.get(data.index!);
      if (blockType !== "thinking") {
        violations.push(`thinking_delta on index=${data.index} (block_type=${blockType})`);
      }
    }
    if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
      const blockType = blockTypeByIndex.get(data.index!);
      if (blockType !== "tool_use") {
        violations.push(`input_json_delta on index=${data.index} (block_type=${blockType})`);
      }
    }
  }
  assert.deepEqual(violations, [], `stream events:\n${JSON.stringify(events, null, 2)}`);

  // Also verify each content_block_start has a matching content_block_stop
  const starts = events.filter((e) => e.data.type === "content_block_start").map((e) => e.data.index);
  const stops = events.filter((e) => e.data.type === "content_block_stop").map((e) => e.data.index);
  for (const idx of starts) {
    assert.ok(stops.includes(idx), `content_block_start at index=${idx} was never closed`);
  }
});

test("omits reasoning field when thinking.type is not 'enabled' (issue #1410)", async () => {
  // Repro: Claude Code sends thinking: { type: "disabled" } on every normal
  // coding request. The previous code emitted `reasoning: { effort, enabled: false }`
  // unconditionally whenever `request.thinking` was truthy, which made
  // providers that don't accept the field (NVIDIA NIM, Qwen3-Coder) crash
  // with 400/500.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const disabledOut = await transformer.transformRequestOut({
    model: "test",
    messages: [],
    thinking: { type: "disabled", budget_tokens: 0 },
  });
  assert.equal(
    disabledOut.reasoning,
    undefined,
    "reasoning field must be absent when thinking.type='disabled'",
  );

  // @ts-expect-error access private for test
  const enabledOut = await transformer.transformRequestOut({
    model: "test",
    messages: [],
    thinking: { type: "enabled", budget_tokens: 8192 },
  });
  assert.deepEqual(enabledOut.reasoning, { effort: "medium", enabled: true });

  // truthy thinking with an unknown type — same treatment as disabled
  // @ts-expect-error access private for test
  const unknownOut = await transformer.transformRequestOut({
    model: "test",
    messages: [],
    thinking: { type: "adaptive", budget_tokens: 4096 },
  });
  assert.equal(
    unknownOut.reasoning,
    undefined,
    "reasoning field must be absent when thinking.type is unknown",
  );
});
