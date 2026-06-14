# ccw × 9Router — Adoption Analysis

**Date:** 2026-06-14
**Status:** Exploratory. No commitment to implement. Read, discuss, decide per feature.
**Source:** [decolua/9router](https://github.com/decolua/9router) (MIT, ~17k stars, Next.js + better-sqlite3 + React 19)

## 1. Context

9router is a local AI router (sibling category to ccw) that sits between CLI coding tools and 40+ providers. It ships several features ccw does not have and that its users regularly ask for:

- Multi-account rotation per provider (round-robin, priority, quota-failover)
- Combos — ordered fallback chains of models (e.g., Claude → GLM → free)
- OAuth auto-refresh for subscription-based providers (Claude Code, GitHub Copilot, etc.)
- Real-time quota tracking with reset countdowns
- RTK token saver (regex/transform-based compression of `tool_result` outputs)
- Caveman mode (terse-output prompt injection)

ccw already covers the basics — five task-kind routing, a transformer chain, presets, statusline, and the web UI. The gaps are on the **provider-account** layer (rotation, OAuth, quota) and on the **fallback** layer (chains instead of single model per kind).

This spec inventories the gaps, ranks them, and notes which are easy, which are hard, and which we should explicitly skip. It is not an implementation plan.

## 2. Current ccw model

```
{ name, api_base_url, api_key, models: string[] }
```

A provider has **one** key, **one** base URL, and a flat list of model ids. The router maps each task kind to a single `provider,model` string. There is no concept of "try the second model if the first 4xx/5xx'd" or "rotate between two API keys for the same provider."

Key files:

- `packages/core/src/config/types.ts` — Provider/Config shapes
- `packages/core/src/router/index.ts` — task-kind → model selection
- `packages/server/src/server.ts` — request lifecycle, transformer chain wiring

## 3. Feature-by-feature

### 3.1 Multi-account rotation per provider

**9router model:** a provider owns an *account pool* (N keys, each with optional label/priority/quota-hint). The router picks an account per request — round-robin, priority, or "next healthy one when the current hits quota."

**ccw today:** one key per provider. Users who want to rotate write a separate preset and switch manually.

**Adoption cost:** medium. The Provider shape grows a `accounts[]` field; the server picks an account per request. The hard part is the failure signal — 9router can detect "this account is in cooldown" only because it tracks quota. ccw would need either a similar tracker or a simpler "rotate on 401/429/5xx" fallback (less precise but much less code).

**Recommendation:** **P0 — adopt.** This is the single most-asked-for feature. Even a simple 401/429/5xx-failover with 2-3 accounts per provider covers ~80% of the use case. A quota-aware rotation can be a follow-up.

### 3.2 Combos (ordered fallback chains)

**9router model:** a combo is an ordered list of `provider,model` references. The router walks the list on each request, calling the next entry when the previous returns a non-recoverable error (quota, 5xx, timeout, content-block mismatch).

**ccw today:** the Router is a `{ default, background, think, longContext, webSearch }` map, each value a single `provider,model`. There is no concept of "try the second model if the first one fails."

**Adoption cost:** low. The Router shape becomes `{ default: string[], background: string[], ... }` — an ordered list. The server keeps a small error-classifier (status code + body shape) and walks the list. No new config UI surface — the Router page already has 5 task-kind rows; each row becomes a comma-separated ordered list.

**Recommendation:** **P0 — adopt.** This is the natural extension of the existing 5-task-kind model. The config-shape change is small. The error-classifier is the only new code.

**Conflict with 3.1:** if both are adopted, the natural shape is `accounts: Account[]` per provider, and the combo is a list of `provider,account?,model` refs. The "account" reference is optional — if absent, the server picks one from the pool (using the 3.1 algorithm). A combo is a list of such references.

### 3.3 OAuth auto-refresh for subscription providers

**9router model:** OAuth 2.0 (PKCE) flow for Claude Code, GitHub Copilot, Cursor, Antigravity. Access + refresh tokens stored in SQLite. A background timer refreshes tokens before they expire; on 401, the server forces a refresh and retries once.

**ccw today:** no OAuth support. All providers use a static `api_key` (env-interpolated).

**Adoption cost:** **high.** This is several weeks of work — PKCE dance per provider, secure storage of refresh tokens, per-provider endpoint differences, scheduler for proactive refresh, retry-on-401 logic. Each subscription provider (Claude Code, Copilot, Cursor, Antigravity) has its own quirks.

**Recommendation:** **P2 — defer.** The audience for OAuth subscriptions is mostly users on personal Claude Pro / Max plans, and they can use 9router for that while ccw stays focused on API-key providers. Adopt only if a clear user base materializes.

### 3.4 Real-time quota tracking

**9router model:** the dashboard reads per-provider quota (token count, reset window — 5h / daily / weekly / monthly) from the provider's own API or a local counter. Shown as a bar with countdown.

**ccw today:** the statusline shows live token spend and cost for the current request. There is no per-provider quota view.

**Adoption cost:** medium-high. Per-provider quota APIs are inconsistent — Anthropic publishes rate-limit headers, OpenAI returns `x-ratelimit-*`, Gemini has its own, OpenRouter exposes `/api/v1/auth/key`. The dashboard would need a per-provider adapter. The statusline would need a "show quota for the active provider" mode.

**Recommendation:** **P1 — adopt later.** Pairs naturally with 3.1 (rotation needs to know which account is in cooldown). Build 3.1 first, then layer quota tracking on top — most of the provider-adapter code is the same.

### 3.5 RTK token saver

**9router model:** a transformer that peeks the first 1KB of each `tool_result` content block, runs a regex/transform filter, and replaces it with a shorter equivalent. Filters include `git-diff`, `git-status`, `grep`, `find`, `ls`, `tree`, `dedup-log`, `smart-truncate`, `read-numbered`, `search-list`. Safe by design — if a filter makes output bigger, the original is kept.

**ccw today:** no tool-output compression. Tool results are passed through unchanged. Users have flagged this on TokenRouter and other strict providers where the 400 from `function name or parameters is empty` traces back to a malformed tool call derived from a bloated prior result.

**Adoption cost:** low. ccw already has a transformer chain (`transformResponseIn` runs after the provider, before the Anthropic SDK sees the response). A `toolResultCompressor` transformer is one new file in `packages/core/src/transformer/`. The 1KB peek + safe-fallback logic is small.

**Recommendation:** **P0 — adopt.** This is a high-leverage, low-risk change. It can be enabled by default, opt-out per provider. ~200 lines of code, no schema changes.

**Note:** the upstream [rtk-ai/rtk](https://github.com/rtk-ai/rtk) project is Rust. 9router ports it to JS. ccw should do the same — keep the filters simple, ship the eight or so that matter, leave the rest.

### 3.6 Caveman mode

**9router model:** a system-prompt addendum that asks the model to produce minimal output. Lives in `/skills`. Toggleable per session.

**ccw today:** no equivalent. The closest is the `?reasoning_effort=low` parameter on OpenAI models, but that only works for some providers.

**Adoption cost:** trivial. A `ccw settings → caveman: bool` flag and a transformer that injects a few sentences into the system prompt. ~50 lines.

**Recommendation:** **P1 — adopt if a user asks.** It's a 50-line feature with no architectural impact, but it is also not a differentiator. Defer until someone asks for it.

### 3.7 Cloud sync between devices

**9router model:** config + accounts sync to 9router's hosted sync. Opt-in.

**ccw today:** no sync. The config is local at `~/.ccw/config.json`. Presets are local Git repos.

**Adoption cost:** high (hosted infra, auth, conflict resolution) + privacy-sensitive.

**Recommendation:** **Skip.** Out of scope for a local-first tool. The existing preset marketplace (Git repos) is the right way to share config across devices.

### 3.8 Docker / multi-arch images

**9router model:** `linux/amd64` + `linux/arm64` images on Docker Hub and GHCR. `DATA_DIR` env var for SQLite persistence.

**ccw today:** the installer clones and builds. No official image. The release page links to "pre-built binaries and Docker images" but the Docker path is not actually maintained.

**Adoption cost:** low — a working Dockerfile and a multi-arch build GH Action. But ccw's value is the local config, the preset marketplace, and the statusline — none of which need Docker.

**Recommendation:** **P2 — adopt if someone asks.** Low priority. The installer works.

## 4. What the data model would look like

If P0 features (3.1, 3.2, 3.5) are adopted, the config schema grows in two places:

```jsonc
{
  "Providers": [
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com",
      "api_key": "$ANTHROPIC_API_KEY",        // legacy single-key still works
      "accounts": [                              // new: optional, overrides api_key
        { "label": "personal", "api_key": "$ANTHROPIC_KEY_1" },
        { "label": "work",     "api_key": "$ANTHROPIC_KEY_2", "priority": 10 }
      ],
      "models": ["claude-sonnet-4-6", "claude-opus-4-7"]
    }
  ],
  "Router": {
    "default":     ["anthropic,claude-sonnet-4-6", "openai,gpt-4o-mini", "groq,llama-3.3-70b"],
    "background":  ["groq,llama-3.1-8b-instant"],
    "think":       ["anthropic,claude-opus-4-7"],
    "longContext": ["anthropic,claude-sonnet-4-6"],
    "webSearch":   ["openai,gpt-4o"]
  }
}
```

A single string in `Router.X` is still accepted and treated as a one-element list (backward compatible). The `accounts` field defaults to `[{ api_key }]` from the legacy single-key field (backward compatible).

## 5. Migration impact

| File | Change |
| --- | --- |
| `packages/core/src/config/types.ts` | Provider gains optional `accounts[]`. Router values are `string \| string[]`. |
| `packages/core/src/router/index.ts` | Resolve a string list to the active model ref. |
| `packages/core/src/transformer/__tests__/anthropic.transformer.test.ts` | New test for `toolResultCompressor`. |
| `packages/core/src/transformer/toolResultCompressor.ts` | New transformer. |
| `packages/server/src/server.ts` | Walk the fallback list on error. Pick an account per request. |
| `packages/ui/src/pages/Router.tsx` | Render each task-kind row as an ordered, draggable list. |
| `packages/ui/src/pages/Providers.tsx` | Render accounts list (add/remove, label, priority). |
| `packages/ui/src/locales/{en,zh}.json` | New keys for accounts, fallback, compressor. |
| `README.md` | "Combos", "Multi-account rotation", "Token saver" sections. |
| `CHANGELOG.md` | New minor version (2.2.0 or 3.0.0 — see below). |

The UI is the bulk of the work. The core is small.

## 6. Versioning

If 3.1, 3.2, and 3.5 ship together, this is a **minor** bump (2.2.0). The config schema is backward compatible — old configs load unchanged, the legacy single-string router values and the legacy single-key `api_key` are both accepted.

A major bump (3.0.0) is only justified if a breaking change is required (e.g., removing the legacy single-key field, or removing single-string router values). Neither is necessary.

## 7. What we explicitly do NOT adopt

- **Cloud sync.** Privacy and infra scope.
- **Subscription OAuth providers.** Weeks of work per provider. Defer until there's a clear ask.
- **9router's full Next.js + SQLite stack.** ccw is React 19 + Vite + JSON config. The architectural difference is intentional — ccw is meant to be a thin shim, not a dashboard product.
- **9router's preset/marketplace patterns.** ccw already has a preset system (folder with `manifest.json` + Git marketplace). 9router's combos are a different concept (ordered model lists, not config bundles). Don't conflate them.
- **The Caveman prompt injection system.** Out of scope; trivial to add as a `ccw settings` flag if asked.
- **Docker images as a first-class install path.** The installer works. Defer.

## 8. Open questions for the user

1. **Multi-account rotation: error-based or quota-based?** Error-based (401/429/5xx → next account) is ~80% of the value at 10% of the code. Quota-based needs per-provider quota adapters and a tracker. I'd start with error-based and add quota-aware rotation later if needed.
2. **Should the fallback chain also rotate accounts within a single model ref?** I.e., `["anthropic,claude-sonnet-4-6", "openai,gpt-4o-mini"]` — if the first is in cooldown, do we try `anthropic` with another account, or jump straight to the second entry? I'd say: try the next account on the same provider first (cheaper, same quality), then move to the next entry. This matches 9router's behavior.
3. **RTK on by default?** I'd say yes, with a per-provider opt-out and a global `ccw settings → toolResultCompressor: bool` toggle. Users on tight token budgets (TokenRouter, free tiers) want it; users on Anthropic Pro might not care.
4. **Caveman mode?** Trivial. Worth shipping alongside RTK or as a separate small PR?
5. **Branding.** 9router's "router" framing (combos, multi-account) leans into the metaphor harder than ccw's. We should pick our own words. My current lean: "fallback chain" for combos, "account pool" for multi-account, "token saver" for RTK, "terse mode" for Caveman.

## 9. Suggested next step

If the user wants to proceed:

1. Pick P0 features to adopt (recommend: 3.1, 3.2, 3.5).
2. Resolve the five open questions above.
3. Write a follow-up spec (one file per feature) that nails down config shape, error classifier, and UI.
4. Plan the implementation in bite-sized tasks per the `superpowers:writing-plans` skill.

If the user wants to defer: this doc stays as a reference. The P0 list is short enough to act on in a single sprint.
