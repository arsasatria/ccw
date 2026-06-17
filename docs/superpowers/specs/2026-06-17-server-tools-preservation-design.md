# Server Tools Preservation in AnthropicTransformer — Design

**Date:** 2026-06-17
**Status:** Approved (brainstorming complete)
**Upstream issue:** #1419 (musistudio/claude-code-router)
**Related:** #1290 (claude-agent-sdk web search broken)

## Goal

Preserve Anthropic server tools (`web_search_20250305`, `code_execution_20250522`, and future server-tool types) through the unified transformer pipeline so that Anthropic-format upstreams can execute them natively. OpenAI-format upstreams continue to work as before — non-function tools are filtered out silently with a debug log.

## Motivation

`AnthropicTransformer.convertAnthropicToolsToUnified()` (anthropic.transformer.ts:306) currently maps **every** tool to `{type: "function", function: {...}}`. Anthropic server tools have `type: "web_search_20250305"` (not `"custom"`) and lack `name`/`input_schema`/`description` in the function shape. They are silently dropped — `name` → `undefined`, `input_schema` → `undefined`.

Ironically, the response path already handles `web_search_tool_result` and `server_tool_use` content blocks correctly (anthropic.transformer.ts:792, 1084). Only the request-side conversion drops them.

The current workaround (`shouldBypassTransformers` with `use: ["Anthropic"]`) works for Anthropic-format endpoints but forces the user into a config that disables all other transformers. A first-class fix lets users route `Router.webSearch` traffic to an Anthropic provider without sacrificing the rest of the pipeline.

## Architecture

`UnifiedTool` becomes a union type. Each transformer is responsible for format-specific conversion at its boundary:

- `AnthropicTransformer.convertAnthropicToolsToUnified` — preserve server tools as-is
- For Anthropic-format upstreams: the unified request passes through to the endpoint (server tools emitted as-is, no extra transformation required)
- `OpenAITransformer.transformRequestIn` — filter out non-function tools with a debug log
- Other transformers (`Gemini`, `Deepseek`, etc.) — left unchanged; their existing `transformRequestIn` either passthrough or wrap to their own format

Router logic unchanged. `Router.webSearch` detection at `utils/router.ts:191` already inspects `tool.type?.startsWith("web_search")` on the original request body and routes to the configured webSearch provider.

## Components

### 1. `UnifiedTool` type (types/llm.ts)

Replace the single-shape interface with a union:

```ts
export type UnifiedTool =
  | {
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: {
          type: "object";
          properties: Record<string, any>;
          required?: string[];
          additionalProperties?: boolean;
          $schema?: string;
        };
      };
    }
  | {
      // Server tool (Anthropic-format). Preserved through the unified
      // pipeline and emitted to Anthropic-compatible providers as-is.
      // OpenAI-compatible providers filter these out.
      type: "web_search_20250305" | "code_execution_20250522" | (string & {});
      [key: string]: any;
    };
```

The `(string & {})` intersection preserves autocomplete for known server-tool types while allowing any string for forward compatibility.

### 2. `convertAnthropicToolsToUnified` rewrite (anthropic.transformer.ts:306)

```ts
private convertAnthropicToolsToUnified(tools: any[]): UnifiedTool[] {
  const emptySchema = { type: "object", properties: {} };
  return tools.map((tool) => {
    // Server tool: pass through unchanged. Downstream transformer
    // (Anthropic for Anthropic endpoint) sends it as-is; OpenAI
    // transformer filters it out.
    if (
      typeof tool.type === "string" &&
      tool.type !== "function" &&
      tool.type !== "custom"
    ) {
      return { ...tool };
    }
    // Custom/function tool: existing logic.
    const inputSchema =
      tool.input_schema && Object.keys(tool.input_schema).length > 0
        ? tool.input_schema
        : emptySchema;
    return {
      type: "function",
      function: {
        name: tool.name || "unknown_tool",
        description: tool.description || "",
        parameters: inputSchema,
      },
    };
  });
}
```

### 3. `OpenAITransformer` filter (openai.transformer.ts)

Today the file is a 6-line passthrough. Add a small `transformRequestIn`:

```ts
export class OpenAITransformer implements Transformer {
  name = "OpenAI";
  endPoint = "/v1/chat/completions";
  logger?: any;

  async transformRequestIn(request: any): Promise<any> {
    if (!Array.isArray(request?.tools)) return request;
    const kept: any[] = [];
    for (const t of request.tools) {
      if (t && t.type === "function") {
        kept.push(t);
      } else {
        this.logger?.debug(
          { droppedType: t?.type },
          "dropping non-function tool (not supported by OpenAI-compatible upstream)",
        );
      }
    }
    return { ...request, tools: kept.length > 0 ? kept : undefined };
  }
}
```

Returns `undefined` for `tools` when the kept list is empty, so the wire format omits the field entirely.

## Data Flow

### Scenario A — web search request → Anthropic provider (target use case)

```
Claude Code
  → POST /v1/messages
     body: { tools: [{type:"web_search_20250305",...}, {type:"function",...}] }
  ↓
Router detects webSearch tool → routes to Router.webSearch provider
  ↓
AnthropicTransformer.transformRequestOut
  → convertAnthropicToolsToUnified preserves web_search_20250305 as-is
  → output: { tools: [{type:"web_search_20250305",...}, {type:"function",...}] }
  ↓
Provider transformers: depends on use list. If "Anthropic" only → bypass;
otherwise OpenAITransformer.transformRequestIn keeps function, drops
web_search_20250305 (but in this scenario routing is to Anthropic
provider which does NOT include OpenAI in use list, so passthrough)
  ↓
sendRequestToProvider → upstream Anthropic-format endpoint receives both tools
  ↓
Anthropic upstream executes web search, returns web_search_tool_result
  ↓
AnthropicTransformer.transformResponseIn (already handles it)
  ✅ works
```

### Scenario B — web search request → OpenAI provider (edge case, user misconfiguration)

Same as A up to router. If Router.webSearch is unset, or routes to an OpenAI provider:

```
AnthropicTransformer.transformRequestOut → preserve web_search_20250305
  ↓
OpenAITransformer.transformRequestIn → drops web_search_20250305 (debug log)
  → keeps function tools
  ↓
Upstream OpenAI provider receives only function tools → no 400
  ✅ no error, but web search not executed (acceptable — user should route web search to Anthropic provider)
```

### Scenario C — function-only request (regression)

No change. `convertAnthropicToolsToUnified` maps to `type:"function"` exactly as today. OpenAITransformer keeps all. Same wire format. Same upstream behavior.

## Error Handling

| Scenario | Current behavior | After fix |
|----------|------------------|-----------|
| Server tool → OpenAI upstream | Silent drop | Debug log + drop |
| Server tool → Anthropic upstream (bypass) | ✅ works (workaround) | ✅ still works |
| Server tool → Anthropic upstream (no bypass) | ❌ dropped | ✅ preserved |
| Function tool without `name` | default `"unknown_tool"` | unchanged |
| Function tool without `input_schema` | default empty schema | unchanged |
| Mixed tools | server dropped | preserved where upstream supports, dropped otherwise |
| Unknown `tool.type` string | treated as function, gets `"unknown_tool"` | preserved as server tool passthrough |
| Empty `tools` array | passthrough | unchanged |

### Mitigations

- `(string & {})` in the type union provides forward compat for new server-tool types without code changes.
- OpenAITransformer filter runs only in `transformRequestIn` — does not touch the response path.
- Debug log is `level: "debug"`, off by default in production (`LOG: false` or no `LOG_LEVEL: "debug"`).

## Testing

### A. `convertAnthropicToolsToUnified` (4 new tests in anthropic.transformer.test.ts)

1. Preserve `web_search_20250305` as-is (no `function` wrapper)
2. Preserve `code_execution_20250522` as-is
3. Mixed array: function + server tools all preserved with correct types
4. Unknown server-tool type string (e.g., `"future_tool_20260101"`) preserved as-is

### B. `OpenAITransformer.transformRequestIn` (new test file openai.transformer.test.ts, 4 tests)

1. Function-only request — unchanged
2. Request with server tool only — server tool dropped, no tools field
3. Mixed — only function tools kept
4. Mock logger — verify debug log fires once per dropped tool

### C. End-to-end (2 new tests in anthropic.transformer.test.ts)

1. `transformRequestOut` with `web_search_20250305` → unified request contains the server tool
2. `transformRequestOut` → `OpenAITransformer.transformRequestIn` chain — server tool dropped before wire

### D. Regression

- Existing test `backfills empty parameters for tools without input_schema` (line 265) must still pass
- All streaming/tool_use tests must still pass
- Existing 72 tests in core package must still pass

Total: +10 new tests, 0 removed.

## Out of Scope (YAGNI)

- Adding an "execute web search via external API" layer for OpenAI providers (e.g., Google, Brave search).
- Changing the shape of `Router.webSearch` config.
- Adding UI for managing server tools (they are declared by Claude Code in the request body, not in CCR config).
- Modifying the response path (already handles `web_search_tool_result` and `server_tool_use`).
- Modifying router logic (`Router.webSearch` detection at `utils/router.ts:191` is correct as-is).
- Modifying other transformer boundaries (`Gemini`, `Deepseek`, `Vercel`, etc.) — they handle their own format conversion.

## Implementation Estimate

- `types/llm.ts` — type union rewrite (~15 lines)
- `anthropic.transformer.ts` — `convertAnthropicToolsToUnified` rewrite (~10 lines added)
- `openai.transformer.ts` — passthrough becomes a real transformer (~15 lines added)
- Tests — +10 across two files
- Total: ~40 lines source, ~150 lines test
- 2 logical commits (type+anthropic, openai transformer)
