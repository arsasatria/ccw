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

test("drops an assistant message whose only block is a thinking block (sanitize context histories)", async () => {
  // Strict OpenAI-spec providers (TokenRouter/MiniMax-M3, Together, OpenRouter,
  // NVIDIA NIM) reject an assistant message with `content: null` and no
  // `tool_calls` — it serializes as `{role: "assistant", content: null}`,
  // which the OpenAI chat completions schema does not allow. Claude Code's
  // history can include turns where the model emitted only a thinking
  // block; the transformed message would otherwise be invalid.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "what's the weather?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "" }, // empty — must be filtered
          { type: "thinking", thinking: "hmm", signature: "sig" },
        ],
      },
    ],
  });

  // The empty assistant message must be dropped entirely; only the user
  // message should remain.
  assert.equal(out.messages.length, 1, "empty assistant message must be dropped");
  assert.equal(out.messages[0].role, "user");
});

test("drops an assistant message whose tool_use is the only block and is filtered as orphan", async () => {
  // Edge case: assistant turn contained only a tool_use, but the
  // tool_result is missing (user interrupted, or history was trimmed).
  // The orphan filter drops the tool_use, leaving content: null with no
  // tool_calls — same invalid shape as the thinking-only case above.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "search for x" },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "search", input: { q: "x" } },
        ],
      },
      // No tool_result for t1 — orphan.
      { role: "user", content: "never mind" },
    ],
  });

  // The assistant turn must be dropped (it has nothing to say), and no
  // tool_call entry should appear anywhere in the transformed history.
  assert.equal(out.messages.length, 2, "empty assistant message must be dropped");
  assert.equal(out.messages[0].role, "user");
  assert.equal(out.messages[0].content, "search for x");
  assert.equal(out.messages[1].role, "user");
  assert.equal(out.messages[1].content, "never mind");

  const anyToolCalls = out.messages.some((m: any) => m.tool_calls?.length);
  assert.equal(anyToolCalls, false, "no tool_calls should be emitted for the dropped assistant turn");
});

test("populates reasoning_content from thinking block for OpenAI-compatible reasoning providers (issue #1400)", async () => {
  // Kimi, DeepSeek V4 (and other OpenAI-compatible reasoning providers)
  // require `reasoning_content` on the assistant message that contains a
  // tool call, otherwise they 400 with
  //   "thinking is enabled but reasoning_content is missing in
  //    assistant tool call message at index N"
  // CCR captures Anthropic thinking as `message.thinking`; the
  // reasoning_content field must be set on the unified message so it
  // serializes through the OpenAI passthrough.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "what's 2+2?" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "The user asked 2+2. Answer: 4.", signature: "sig-a" },
          { type: "text", text: "4" },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
    ],
  });

  const assistant = out.messages.find((m: any) => m.role === "assistant");
  assert.ok(assistant, "expected an assistant message");
  assert.equal(
    (assistant as any).reasoning_content,
    "The user asked 2+2. Answer: 4.",
    "reasoning_content must mirror thinking.content for OpenAI-spec reasoning providers",
  );
  // The original Anthropic thinking block is still preserved.
  assert.deepEqual(assistant!.thinking, { content: "The user asked 2+2. Answer: 4.", signature: "sig-a" });
});

test("omits reasoning_content when assistant has no thinking block", async () => {
  // No thinking = no reasoning_content. Otherwise non-reasoning
  // providers get a confusing empty field.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ],
  });

  const assistant = out.messages.find((m: any) => m.role === "assistant");
  assert.ok(assistant, "expected an assistant message");
  assert.equal(
    (assistant as any).reasoning_content,
    undefined,
    "reasoning_content must be omitted when there is no thinking block",
  );
});

test("joins non-empty assistant text parts and preserves tool_calls and thinking", async () => {
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "search for x" },
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
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "hit" }],
      },
    ],
  });

  assert.equal(out.messages[1].content, "first\nsecond");
  assert.deepEqual(out.messages[1].tool_calls, [
    { id: "t1", type: "function", function: { name: "search", arguments: '{"q":"x"}' } },
  ]);
  assert.deepEqual(out.messages[1].thinking, { content: "reasoning", signature: "sig-1" });
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
  // Repro of issue #1355: CCW proxying DeepSeek V4 with thinking enabled
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

test("drops tool_use blocks without a name and backfills empty tool name/parameters (TokenRouter 400 fix)", async () => {
  // Background: providers like TokenRouter/MiniMax-M3, Together, OpenRouter,
  // and NVIDIA NIM reject tool calls with empty `function.name` or empty
  // `function.parameters`. The previous transformer only checked `c.id` on
  // assistant history blocks, so a malformed `tool_use` from upstream
  // Claude Code (e.g. server-tool recovery, partial history) slipped through
  // and got serialized as `{ name: undefined, arguments: "{}" }`. The
  // provider then 400'd mid-stream with code 2013, which the Anthropic SDK
  // surfaced as "Content block is not a text block" on the next call.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "search the docs" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking..." },
          // Malformed: id but no name. Must be dropped.
          { type: "tool_use", id: "toolu_bad", input: { x: 1 } },
          // Well-formed: must be preserved.
          { type: "tool_use", id: "toolu_good", name: "search", input: { q: "x" } },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_good", content: "hit" }],
      },
    ],
    tools: [
      // No name → must backfill to "unknown_tool".
      { name: "", description: "empty name", input_schema: { type: "object", properties: { a: { type: "string" } } } },
      // No input_schema → must backfill to emptySchema.
      { name: "no_schema_tool", description: "no schema" },
      // input_schema: {} → must backfill (the actual bug — `??` only catches null/undefined).
      { name: "empty_schema_tool", description: "empty schema", input_schema: {} },
      // Well-formed → must be preserved.
      { name: "search", description: "search docs", input_schema: { type: "object", properties: { q: { type: "string" } } } },
    ],
  });

  // 1. Assistant history: only the well-formed tool_use remains.
  const assistantWithTools = out.messages.find(
    (m: any) => m.role === "assistant" && m.tool_calls?.length,
  );
  assert.ok(assistantWithTools, "expected an assistant message with tool_calls");
  assert.equal(assistantWithTools!.tool_calls!.length, 1, "malformed tool_use (no name) must be dropped");
  assert.equal(assistantWithTools!.tool_calls![0].id, "toolu_good");
  assert.equal(assistantWithTools!.tool_calls![0].function.name, "search");
  assert.equal(assistantWithTools!.tool_calls![0].function.arguments, '{"q":"x"}');

  // 2. Tool definitions: every one has a non-empty name.
  assert.equal(out.tools!.length, 4);
  for (const t of out.tools!) {
    assert.ok(
      typeof t.function.name === "string" && t.function.name.length > 0,
      `tool name must be non-empty, got: ${JSON.stringify(t)}`,
    );
  }
  const names = out.tools!.map((t: any) => t.function.name).sort();
  assert.deepEqual(names, ["empty_schema_tool", "no_schema_tool", "search", "unknown_tool"]);

  // 3. Tool definitions: every one has a non-empty parameters object.
  for (const t of out.tools!) {
    assert.ok(
      t.function.parameters && typeof t.function.parameters === "object" && Object.keys(t.function.parameters).length > 0,
      `tool parameters must be a non-empty object, got: ${JSON.stringify(t)}`,
    );
  }

  // 4. The well-formed tool's parameters are preserved as-is, not overwritten
  //    by the emptySchema fallback.
  const searchTool = out.tools!.find((t: any) => t.function.name === "search")!;
  assert.deepEqual(searchTool.function.parameters, {
    type: "object",
    properties: { q: { type: "string" } },
  });
});

test("drops orphan tool_use and orphan tool_result in history (TokenRouter 2013 fix)", async () => {
  // OpenAI-spec providers (TokenRouter/MiniMax-M3, Together, OpenRouter,
  // NVIDIA NIM) reject with code 2013 when:
  //   - assistant.tool_calls is not directly followed by tool messages
  //     with matching tool_call_id ("tool call result does not follow
  //     tool call")
  //   - a tool message has a tool_call_id with no matching preceding
  //     assistant.tool_calls ("tool result's tool id not found")
  // Anthropic SDK allows tool_use without a following tool_result (user
  // interruption), so we must drop the orphans before sending. The
  // provider 400s mid-stream; the Anthropic SDK reframes the error event
  // as "Content block is not a text block".
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "hi" },
      // Orphan tool_use: no following tool_result. The text part is kept,
      // the tool_use must be dropped.
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "orphan_use", name: "search", input: { q: "x" } },
        ],
      },
      // No tool_result following — user "interrupted" the tool flow.
      { role: "user", content: "never mind" },
      // Orphan tool_result: no preceding tool_use. The tool_result must
      // be dropped; the text part is kept as a normal user message.
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "orphan_result", content: "result" },
          { type: "text", text: "and also..." },
        ],
      },
      // Well-formed pair: must be preserved.
      {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "tool_use", id: "good", name: "search", input: { q: "y" } },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "good", content: "found" }],
      },
    ],
  });

  // Expected output (6 messages):
  //   0. user "hi"
  //   1. assistant "let me check"  (orphan tool_use dropped → no tool_calls)
  //   2. user "never mind"
  //   3. user "and also..."        (orphan tool_result dropped)
  //   4. assistant "checking" + tool_call for "good"
  //   5. tool message for "good"
  assert.equal(out.messages.length, 6);

  assert.equal(out.messages[0].role, "user");
  assert.equal(out.messages[0].content, "hi");

  assert.equal(out.messages[1].role, "assistant");
  assert.equal(out.messages[1].content, "let me check");
  assert.equal(
    out.messages[1].tool_calls,
    undefined,
    "orphan tool_use must not produce a tool_call",
  );

  assert.equal(out.messages[2].role, "user");
  assert.equal(out.messages[2].content, "never mind");

  assert.equal(out.messages[3].role, "user");
  assert.deepEqual(out.messages[3].content, [{ type: "text", text: "and also..." }]);

  assert.equal(out.messages[4].role, "assistant");
  assert.equal(out.messages[4].content, "checking");
  assert.equal(out.messages[4].tool_calls?.length, 1);
  assert.equal(out.messages[4].tool_calls![0].id, "good");
  assert.equal(out.messages[4].tool_calls![0].function.name, "search");

  assert.equal(out.messages[5].role, "tool");
  assert.equal(out.messages[5].tool_call_id, "good");
  assert.equal(out.messages[5].content, "found");
});

test("drops tool_use that has tool_result in a later (non-adjacent) user message", async () => {
  // OpenAI spec requires the tool_result to IMMEDIATELY follow the
  // assistant.tool_calls. A tool_result in a later, non-adjacent user
  // message doesn't count — the tool_use must still be dropped.
  const transformer = new AnthropicTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestOut({
    model: "test",
    messages: [
      { role: "user", content: "search" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "search", input: { q: "x" } }],
      },
      // Regular user message (NOT a tool_result) sits between.
      { role: "user", content: "actually never mind" },
      // Late tool_result for t1 — but the assistant is already past
      // the tool_use. This is the "out-of-order" edge case.
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "late" }] },
    ],
  });

  // The orphan tool_use must be dropped; the late tool_result must also
  // be dropped (it has no valid preceding tool_call in the converted
  // history).
  const toolMessages = out.messages.filter((m: any) => m.role === "tool");
  assert.equal(toolMessages.length, 0, "late tool_result must be dropped");

  const assistantWithCalls = out.messages.find(
    (m: any) => m.role === "assistant" && m.tool_calls?.length,
  );
  assert.equal(
    assistantWithCalls,
    undefined,
    "non-adjacent tool_use must not produce a tool_call",
  );
});

test("closes open content block before emitting mid-stream error event (Anthropic SDK reframe fix)", async () => {
  // When the OpenAI-compatible provider returns chunk.error mid-stream
  // (e.g. TokenRouter/MiniMax-M3 returning an upstream error after some
  // content has already streamed), the previous code emitted
  //   content_block_start (text)
  //   content_block_delta
  //   event: error        <-- no preceding content_block_stop
  // The Anthropic SDK reframes that as
  //   "API Error: Content block is not a text block"
  // because the error event arrived while the text block was still open.
  //
  // The fix: close any open content block BEFORE emitting the error event.
  const upstreamChunks: string[] = [
    `data: ${JSON.stringify({
      id: "cmpl-err", model: "test-model",
      choices: [{ index: 0, delta: { role: "assistant", content: "Let me think" }, finish_reason: null }],
    })}\n\n`,
    // Some providers stream a content delta or two, then a final error chunk.
    `data: ${JSON.stringify({
      id: "cmpl-err", model: "test-model",
      choices: [{ index: 0, delta: { content: " about this..." }, finish_reason: null }],
    })}\n\n`,
    // Mid-stream error chunk (real TokenRouter 5xx responses surface here).
    `data: ${JSON.stringify({
      id: "cmpl-err", model: "test-model",
      error: {
        message: "upstream provider error",
        type: "api_error",
        code: "internal_error",
      },
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const response = new Response(
    buildReadableStreamFromChunks(upstreamChunks),
    { headers: { "Content-Type": "text/event-stream" } },
  );

  const transformer = new AnthropicTransformer();
  transformer.logger = logger;
  const out = await transformer.transformResponseIn(response, { req: { id: "test-err" } });
  const events = await collectEvents(out!);

  // Find the indices of the last content_block_stop, the error event, and
  // the first content_block_start to assert ordering.
  const firstStart = events.findIndex((e) => e.event === "content_block_start");
  const lastStop = events
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.event === "content_block_stop")
    .pop();
  const errorIdx = events.findIndex((e) => e.event === "error");

  assert.ok(firstStart >= 0, "expected a content_block_start event");
  assert.ok(lastStop && lastStop.i >= 0, "expected at least one content_block_stop");
  assert.ok(errorIdx >= 0, "expected an error event");

  assert.ok(
    lastStop!.i < errorIdx,
    `error event must come AFTER the last content_block_stop, ` +
    `got stop at ${lastStop!.i}, error at ${errorIdx}; ` +
    `events: ${JSON.stringify(events.map((e) => e.event))}`,
  );

  // The error event itself must carry the provider's error message.
  const errorEvent = events[errorIdx];
  assert.equal(errorEvent.data.type, "error");
  assert.ok(
    JSON.stringify(errorEvent.data).includes("upstream provider error"),
    `error event should include provider error message, got: ${JSON.stringify(errorEvent.data)}`,
  );
});
