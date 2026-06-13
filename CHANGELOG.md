# Changelog

All notable changes to **ccw** are documented in this file. ccw is a fork of
[musistudio/claude-code-router](https://github.com/musistudio/claude-code-router).

## 1.0.0 — 2026-06-13

Initial release of the standalone fork. All upstream code is inherited from
musistudio/claude-code-router at the time of forking; the project is renamed
to **ccw**, retargeted to its own GitHub repository, and re-licensed under
MIT (Copyright (c) 2026 arsasatria).

### Bug fixes

- **Fix: `API Error: Content block is not a text block` on interleaved
  text + `tool_use` streams** (issues [#1356](https://github.com/musistudio/claude-code-router/issues/1356),
  [#1371](https://github.com/musistudio/claude-code-router/issues/1371)).
  `AnthropicTransformer.convertOpenAIStreamToAnthropic` previously used
  `hasTextContentStarted` as a proxy for "is the current open content block
  a text block?", but the flag was only ever set to `true` and never reset
  when a `tool_use` block took over. This caused a later `delta.content`
  chunk to emit a `text_delta` event on the `tool_use` block's index, which
  the Anthropic SDK rejects.
  Replaced the flag with `currentContentBlockType: "text" | "tool_use" |
  "thinking" | "web_search_tool_result" | null`, set whenever a
  `content_block_start` is emitted and cleared whenever `content_block_stop`
  is emitted. Models that stream text before, between, and after tool calls
  (DeepSeek V4 Pro, Kimi K2.5, Qwen 3) now work without crashes.

- **Fix: `tools[0].function: missing field parameters` from strict
  OpenAI-spec providers** (issue [#1371](https://github.com/musistudio/claude-code-router/issues/1371)).
  `AnthropicTransformer.convertAnthropicToolsToUnified` passed
  `tool.input_schema` straight through to `function.parameters`. When a tool
  omitted `input_schema` (server tools, no-arg tools), the field became
  `undefined` and was dropped during JSON serialization, causing Together,
  OpenRouter, NVIDIA NIM, and other strict providers to reject the request.
  Backfilled with `{ type: "object", properties: {} }` when missing.

### Infrastructure

- New one-line installers (`install.ps1` for Windows, `install.sh` for
  macOS/Linux) inspired by the [deepclaude](https://github.com/RafiulM/deepclaude)
  installer pattern: verify Node.js >= 20, ensure pnpm via corepack, clone
  the source, build, drop a shim, and add the install directory to the user
  PATH. Idempotent — re-running acts as an updater.
- Renamed binary from `ccr` to `ccw` (matches the repo name).
- Renamed root package to `ccw`; added MIT LICENSE and a fork notice at the
  top of the README.

### Regression test

- `packages/core/src/transformer/__tests__/anthropic.transformer.test.ts`
  simulates a `text → tool_use → text` interleaved stream and asserts that
  no `text_delta` event is ever emitted on a `tool_use` block's index. Run
  with `cd packages/core && npx tsx --test src/transformer/__tests__/anthropic.transformer.test.ts`.
