/**
 * Regression test for the reasoning transformer's streaming output.
 *
 * Reproduces the reasoning → tool_calls scenario from upstream issue #1397:
 * when a reasoning model emits tool calls right after its reasoning text, two
 * bugs in the streaming handler used to compound and break tool-call argument
 * accumulation:
 *
 *   Bug 1: every chunk after reasoning was complete had its
 *          `data.choices[0].index` incremented by 1, so the downstream
 *          translator saw tool-call argument deltas attributed to a
 *          non-existent "choice 1" and dropped them or assembled them wrong.
 *
 *   Bug 2: the "reasoning is done" transition chunk was built by spreading
 *          `...data.choices[0].delta`, so when the original chunk carried
 *          `tool_calls`, the same tool-call deltas ended up emitted twice —
 *          once on the transition chunk, once on the original chunk —
 *          producing malformed `input` JSON.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ReasoningTransformer } from "../reasoning.transformer";

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

interface OpenAIChunk {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: Record<string, any>;
    finish_reason: string | null;
  }>;
}

async function collectChunks(response: Response): Promise<OpenAIChunk[]> {
  if (!response.body) throw new Error("no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const out: OpenAIChunk[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const records = buf.split("\n\n");
    buf = records.pop() || "";
    for (const rec of records) {
      for (const line of rec.split("\n")) {
        if (line.startsWith("data: ") && line.slice(6).trim() !== "[DONE]") {
          try {
            out.push(JSON.parse(line.slice(6)));
          } catch {
            // ignore non-JSON
          }
        }
      }
    }
  }
  return out;
}

test("does not bump choices[0].index on chunks after reasoning is complete (issue #1397 Bug 1)", async () => {
  const upstreamChunks: string[] = [
    // reasoning chunk
    `data: ${JSON.stringify({
      id: "cmpl-x", model: "test-model",
      choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "hmm" }, finish_reason: null }],
    })}\n\n`,
    // reasoning chunk 2
    `data: ${JSON.stringify({
      id: "cmpl-x", model: "test-model",
      choices: [{ index: 0, delta: { reasoning_content: " let me check" }, finish_reason: null }],
    })}\n\n`,
    // tool_call opens (this also closes reasoning — triggers the buggy path)
    `data: ${JSON.stringify({
      id: "cmpl-x", model: "test-model",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Bash", arguments: "" } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    // tool_call argument delta
    `data: ${JSON.stringify({
      id: "cmpl-x", model: "test-model",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"command":' } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    // tool_call argument delta 2
    `data: ${JSON.stringify({
      id: "cmpl-x", model: "test-model",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: '"uname"}' } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const upstream = buildReadableStreamFromChunks(upstreamChunks);
  const response = new Response(upstream, {
    headers: { "Content-Type": "text/event-stream" },
  });
  const transformer = new ReasoningTransformer();
  transformer.logger = logger;
  const out = await transformer.transformResponseOut(response, { req: { id: "test" } });
  const chunks = await collectChunks(out!);

  // Every emitted chunk must have choices[0].index === 0.
  // Before the fix, the third chunk onwards had index 1.
  const wrong: number[] = [];
  chunks.forEach((c, i) => {
    if (c.choices?.[0]?.index !== 0) {
      wrong.push(i);
    }
  });
  assert.deepEqual(wrong, [], `chunks with wrong index: ${JSON.stringify(chunks, null, 2)}`);
});

test("does not duplicate tool_call argument deltas when reasoning transitions to tool_calls (issue #1397 Bug 2)", async () => {
  const upstreamChunks: string[] = [
    `data: ${JSON.stringify({
      id: "cmpl-y", model: "test-model",
      choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "thinking..." }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "cmpl-y", model: "test-model",
      choices: [{ index: 0, delta: { reasoning_content: " still thinking" }, finish_reason: null }],
    })}\n\n`,
    // The transition chunk: original has tool_calls, reasoning transformer
    // should emit a SEPARATE transition chunk with thinking+signature and
    // then emit the original tool_call chunk ONCE (not twice).
    `data: ${JSON.stringify({
      id: "cmpl-y", model: "test-model",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Bash", arguments: '{"command":' } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "cmpl-y", model: "test-model",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: '"uname"}' } }] },
        finish_reason: null,
      }],
    })}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const upstream = buildReadableStreamFromChunks(upstreamChunks);
  const response = new Response(upstream, {
    headers: { "Content-Type": "text/event-stream" },
  });
  const transformer = new ReasoningTransformer();
  transformer.logger = logger;
  const out = await transformer.transformResponseOut(response, { req: { id: "test" } });
  const chunks = await collectChunks(out!);

  // Concatenate every tool_call argument fragment from every emitted chunk.
  // Before the fix, the transition chunk spread ...data.choices[0].delta so
  // tool_calls leaked into the transition chunk and then the original chunk
  // was emitted again — the same argument fragment appeared twice, breaking
  // the downstream JSON accumulator.
  const fragments: string[] = [];
  for (const c of chunks) {
    const toolCalls = c.choices?.[0]?.delta?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        const arg = tc?.function?.arguments;
        if (typeof arg === "string") fragments.push(arg);
      }
    }
  }
  const joined = fragments.join("");
  assert.equal(
    joined,
    '{"command":"uname"}',
    `expected exactly one copy of each tool_call argument fragment, got: ${JSON.stringify(fragments)}`,
  );
});
