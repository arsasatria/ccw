/**
 * Regression tests for issue #1372: Claude Code prefixes its system prompt
 * with a per-request `x-anthropic-billing-header: cc_version=...; cch=<hash>;`
 * line. The `cch` value is regenerated every request. Forwarding this verbatim
 * into the upstream Responses API makes the upstream prompt prefix unique on
 * every turn and busts the upstream prompt cache (5-10x cost & latency hit).
 *
 * The transformer's job is to strip these non-semantic header lines from the
 * system content before sending upstream.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIResponsesTransformer } from "../openai.responses.transformer";

test("strips x-anthropic-billing-header lines from system content (issue #1372)", async () => {
  const transformer = new OpenAIResponsesTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestIn({
    model: "test",
    messages: [
      {
        role: "system",
        content:
          "x-anthropic-billing-header: cc_version=2.1.117.48f; cc_entrypoint=cli; cch=71fea;\n" +
          "You are Claude Code, Anthropic's official CLI for Claude.\n" +
          "Be concise. Prefer tools over prose.",
      },
    ],
  });

  const instructions = (out as any).instructions as string;
  assert.ok(
    !/x-anthropic-billing-header/i.test(instructions),
    `billing-header line must be stripped, got: ${JSON.stringify(instructions)}`,
  );
  assert.ok(
    instructions.includes("You are Claude Code"),
    "real system prompt must be preserved",
  );
  assert.ok(
    instructions.includes("Be concise"),
    "subsequent system prompt lines must be preserved",
  );
});

test("strips billing-header line that appears mid-prompt as well", async () => {
  const transformer = new OpenAIResponsesTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestIn({
    model: "test",
    messages: [
      {
        role: "system",
        content: [
          { type: "text", text: "Be concise." },
          { type: "text", text: "x-anthropic-billing-header: cc_version=2.1.117.48f; cch=abcdef;\nMore text after header." },
        ],
      },
    ],
  });

  // @ts-expect-error access private for test
  const input = (out as any).input as Array<{ role: string; content: string }>;
  const allSystemContent = input
    .filter((i) => i.role === "system")
    .map((i) => i.content)
    .join("\n");
  assert.ok(
    !/x-anthropic-billing-header/i.test(allSystemContent),
    `billing-header line must be stripped, got: ${JSON.stringify(allSystemContent)}`,
  );
  assert.ok(
    allSystemContent.includes("More text after header"),
    "real content that followed the header must be preserved",
  );
});

test("is case-insensitive about the header prefix", async () => {
  const transformer = new OpenAIResponsesTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestIn({
    model: "test",
    messages: [
      {
        role: "system",
        content: "X-Anthropic-Billing-Header: cc_version=2.1.117.48f; cch=deadbeef;\nKeep this.",
      },
    ],
  });
  const instructions = (out as any).instructions as string;
  assert.ok(!/billing-header/i.test(instructions), "header line must be stripped regardless of case");
  assert.ok(instructions.includes("Keep this"), "real content must remain");
});

test("leaves the system prompt alone when there is no billing-header line", async () => {
  const transformer = new OpenAIResponsesTransformer();
  // @ts-expect-error access private for test
  const out = await transformer.transformRequestIn({
    model: "test",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant.\nRespond in English.",
      },
    ],
  });
  const instructions = (out as any).instructions as string;
  assert.equal(
    instructions,
    "You are a helpful assistant.\nRespond in English.",
    "untouched system prompt must be preserved verbatim",
  );
});
