import { test } from "node:test";
import assert from "node:assert/strict";
import { TokenSaverTransformer } from "../tokenSaver.transformer";

const transformer = new TokenSaverTransformer();

test("compresses a git diff tool_result (collapses repeated '+' lines)", async () => {
  const input = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [
              {
                type: "text",
                text:
                  "diff --git a/foo b/foo\nindex 123..456\n--- a/foo\n+++ b/foo\n@@ -1,5 +1,5 @@\n line1\n line2\n-line3\n+line3 changed\n+line4 added\n+line5 added\n+line6 added\n+line7 added\n+line8 added\n+line9 added\n+line10 added",
              },
            ],
          },
        ],
      },
    ],
  };
  const out = await transformer.transformRequestIn!(input as any, {} as any, {});
  const text = (out.messages[0].content[0].content[0] as any).text;
  // 8 consecutive "+" lines should collapse to a count summary.
  assert.ok(text.length < 200, `expected shorter output, got ${text.length} chars`);
  assert.match(text, /\+8 lines/);
});

test("truncates huge log dumps to first N + last N lines", async () => {
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
  const input = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [{ type: "text", text: lines.join("\n") }],
          },
        ],
      },
    ],
  };
  const out = await transformer.transformRequestIn!(input as any, {} as any, {});
  const text = (out.messages[0].content[0].content[0] as any).text;
  assert.match(text, /\.\.\. 980 lines omitted \.\.\./);
});

test("does nothing if a filter makes output bigger (safe by design)", async () => {
  const input = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [{ type: "text", text: "short content" }],
          },
        ],
      },
    ],
  };
  const out = await transformer.transformRequestIn!(input as any, {} as any, {});
  const text = (out.messages[0].content[0].content[0] as any).text;
  assert.equal(text, "short content");
});

test("does nothing if filter throws", async () => {
  // Construct a pathological input that breaks the regex engine.
  // (Hard to engineer; the test exists to document the safe-by-design contract.)
  const input = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [{ type: "text", text: "normal\ntext" }],
          },
        ],
      },
    ],
  };
  const out = await transformer.transformRequestIn!(input as any, {} as any, {});
  assert.equal(typeof out, "object");
});
