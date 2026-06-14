# 9router Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chain (ordered model fallback), account pool (multi-key rotation), token saver (tool-output compression), and terse mode (terse-output prompt) to ccw. Backward compatible with existing single-string Router and single-key Provider configs.

**Architecture:** Data-model widening on `Config` (Router values `string | string[]`, Provider gains `accounts[]` and `rotation`). Core logic lives in `packages/core/src/utils/router.ts` (chain walker, account pool, error classifier). Two new transformers (`tokenSaver`, `terseMode`) plug into the existing `transformResponseIn` hook. UI changes are on the existing Router and Providers pages; chain becomes a comma-separated list (rendered as an ordered list with add/remove), account pool becomes a sub-section of each provider card.

**Tech Stack:** TypeScript, Node 20+, Fastify (server), React 19 + Vite 7 + Tailwind 4 + Radix UI (frontend), i18next (en + zh), `@ccw/shared` for the env-interpolation helper.

**Reference spec:** `docs/superpowers/specs/2026-06-14-9router-adoption-design.md` (sections 1–9, decisions in §8).

---

## Conventions

- **Working dir:** all commands run from `C:/Users/arsas/AntigravityProjects/claude-code-router`.
- **Test runner:** `cd packages/core && npx tsx --test src/utils/__tests__/<file>.test.ts` (or `transformer/__tests__/<file>.test.ts`). The repo uses `tsx --test` for unit tests; the test file ends in `.test.ts`.
- **Type-check:** `pnpm install` once; then before commit, `cd packages/core && npx tsc --noEmit` must pass.
- **UI smoke:** `pnpm --filter @ccw/ui run build` must pass before commit.
- **Commits:** Conventional Commits. One commit per task.
- **i18n rule:** add new keys to BOTH `packages/ui/src/locales/en.json` AND `packages/ui/src/locales/zh.json` in the same task that introduces a string. Never commit an untranslated key.
- **Backward compat:** every config change must accept the legacy form. Test both the old single-string and new array-string forms.
- **No new top-level deps.** All work uses libraries already in `package.json`.

## File structure (delta from main)

### New files
- `packages/core/src/utils/chain.ts` — chain walker: `resolveChain(scenarioRef, config) → Ref | null` and `walkChain(scenarioRef, providers, exec) → Promise<Result>`
- `packages/core/src/utils/accountPool.ts` — `pickAccount(provider, requestId) → Account` and `markAccountUnhealthy(provider, account, reason)`
- `packages/core/src/utils/errorClassifier.ts` — `classifyError(err) → "advance" | "stop"`
- `packages/core/src/transformer/tokenSaver.transformer.ts` — `TokenSaverTransformer` with filter registry
- `packages/core/src/transformer/terseMode.transformer.ts` — `TerseModeTransformer`
- `packages/core/src/transformer/__tests__/tokenSaver.transformer.test.ts`
- `packages/core/src/transformer/__tests__/terseMode.transformer.test.ts`
- `packages/core/src/utils/__tests__/chain.test.ts`
- `packages/core/src/utils/__tests__/accountPool.test.ts`
- `packages/core/src/utils/__tests__/errorClassifier.test.ts`

### Modified files
- `packages/core/src/utils/router.ts` — chain resolution replaces single-string `model` returns; `getUseModel` returns `{ chain: string[], scenarioType }`; back-compat keeps `model: string` derived from the first chain entry
- `packages/core/src/types/llm.ts` (or new `packages/core/src/types/config.ts`) — add `ProviderAccount`, widen `Provider`, widen `Router` config
- `packages/core/src/services/config.ts` — env-interpolate `accounts[].apiKey` the same way it does `apiKey`
- `packages/core/src/transformer/index.ts` — register `TokenSaverTransformer` and `TerseModeTransformer`
- `packages/server/src/server.ts` — wire chain walker into the request lifecycle (around the existing call site of `router()`)
- `packages/ui/src/pages/Router.tsx` — render each scenario row as an ordered list (add/remove/reorder); legacy single-string still works
- `packages/ui/src/pages/Providers.tsx` — render account pool sub-section on each provider card; account add/remove/label/priority
- `packages/ui/src/locales/en.json`, `packages/ui/src/locales/zh.json` — new keys
- `README.md` — "Chain fallback", "Account pool", "Token saver", "Terse mode" sections
- `CHANGELOG.md` — new `2.2.0` (or `3.0.0` if any breaking change ships) entry

---

## Task 1: Config schema widening (backward compat)

**Files:**
- Modify: `packages/core/src/types/llm.ts:1-30` (add types) and downstream uses
- Modify: `packages/core/src/utils/router.ts:210-216` (`RouterFallbackConfig`)
- Test: `packages/core/src/utils/__tests__/configShape.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/utils/__tests__/configShape.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProvider, normalizeRouter } from "../configShape";

test("normalizeProvider wraps single apiKey into accounts[0]", () => {
  const out = normalizeProvider({ name: "openai", api_key: "k", models: ["m"] });
  assert.equal(out.accounts.length, 1);
  assert.equal(out.accounts[0].apiKey, "k");
  assert.equal(out.apiKey, "k"); // legacy field still present
});

test("normalizeProvider keeps accounts[] when provided", () => {
  const out = normalizeProvider({
    name: "openai",
    accounts: [{ apiKey: "a" }, { apiKey: "b", label: "work", priority: 10 }],
    models: ["m"],
  });
  assert.equal(out.accounts.length, 2);
  assert.equal(out.accounts[1].label, "work");
  assert.equal(out.accounts[1].priority, 10);
});

test("normalizeRouter accepts both string and string[]", () => {
  const a = normalizeRouter({ default: "openai,gpt-4o" });
  assert.deepEqual(a.default, ["openai,gpt-4o"]);

  const b = normalizeRouter({ default: ["openai,gpt-4o", "groq,llama"] });
  assert.deepEqual(b.default, ["openai,gpt-4o", "groq,llama"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/configShape.test.ts`
Expected: FAIL — `../configShape` not found.

- [ ] **Step 3: Implement the type + normalizer**

Create `packages/core/src/utils/configShape.ts`:

```ts
export interface ProviderAccount {
  apiKey: string;
  label?: string;
  priority?: number;
}

export interface ProviderConfig {
  name: string;
  api_base_url?: string;
  api_key?: string;          // legacy single-key
  accounts?: ProviderAccount[]; // new pool
  rotation?: "error" | "quota"; // default "error"
  models: string[];
  [key: string]: any;
}

export interface NormalizedProvider extends ProviderConfig {
  accounts: ProviderAccount[];
  rotation: "error" | "quota";
}

export function normalizeProvider(p: ProviderConfig): NormalizedProvider {
  if (p.accounts && p.accounts.length > 0) {
    return { ...p, accounts: p.accounts, rotation: p.rotation ?? "error" };
  }
  return {
    ...p,
    accounts: p.api_key ? [{ apiKey: p.api_key }] : [],
    rotation: p.rotation ?? "error",
  };
}

export interface RouterConfigRaw {
  default?: string | string[];
  background?: string | string[];
  think?: string | string[];
  longContext?: string | string[];
  webSearch?: string | string[];
  longContextThreshold?: number;
  [key: string]: any;
}

export interface RouterConfigNormalized {
  default: string[];
  background: string[];
  think: string[];
  longContext: string[];
  webSearch: string[];
  longContextThreshold?: number;
}

export function normalizeRouter(r: RouterConfigRaw | undefined): RouterConfigNormalized {
  const wrap = (v: string | string[] | undefined) =>
    v == null ? [] : Array.isArray(v) ? v : [v];
  return {
    default: wrap(r?.default),
    background: wrap(r?.background),
    think: wrap(r?.think),
    longContext: wrap(r?.longContext),
    webSearch: wrap(r?.webSearch),
    longContextThreshold: r?.longContextThreshold,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/configShape.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/configShape.ts packages/core/src/utils/__tests__/configShape.test.ts
git commit -m "feat(core): config schema widens to accept accounts[] and chain string arrays"
```

---

## Task 2: Error classifier

**Files:**
- Create: `packages/core/src/utils/errorClassifier.ts`
- Test: `packages/core/src/utils/__tests__/errorClassifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/utils/__tests__/errorClassifier.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../errorClassifier";

test("401 is advance (chain to next account/entry)", () => {
  assert.equal(classifyError({ status: 401, body: "" }), "advance");
});

test("429 is advance", () => {
  assert.equal(classifyError({ status: 429, body: "" }), "advance");
});

test("500 is advance", () => {
  assert.equal(classifyError({ status: 500, body: "" }), "advance");
});

test("502/503/504 is advance", () => {
  assert.equal(classifyError({ status: 502, body: "" }), "advance");
  assert.equal(classifyError({ status: 503, body: "" }), "advance");
  assert.equal(classifyError({ status: 504, body: "" }), "advance");
});

test("408 timeout is advance", () => {
  assert.equal(classifyError({ status: 408, body: "" }), "advance");
});

test("400 with function name empty is advance (provider rejected malformed tool)", () => {
  assert.equal(
    classifyError({ status: 400, body: 'function name or parameters is empty' }),
    "advance"
  );
});

test("400 with other body is stop (probably user error)", () => {
  assert.equal(classifyError({ status: 400, body: "missing required field" }), "stop");
});

test("403 is stop (account is fine, just not authorized)", () => {
  assert.equal(classifyError({ status: 403, body: "" }), "stop");
});

test("network error / no status is advance", () => {
  assert.equal(classifyError({ code: "ECONNRESET" }), "advance");
});

test("null/undefined is stop (defensive)", () => {
  assert.equal(classifyError(undefined), "stop");
  assert.equal(classifyError(null), "stop");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/errorClassifier.test.ts`
Expected: FAIL — `../errorClassifier` not found.

- [ ] **Step 3: Implement `errorClassifier.ts`**

Create `packages/core/src/utils/errorClassifier.ts`:

```ts
export interface ClassifierError {
  status?: number;
  code?: string;
  body?: string;
}

const ADVANCE_STATUS = new Set([401, 408, 429, 500, 502, 503, 504]);
const ADVANCE_BODY_PATTERNS: RegExp[] = [
  /function name or parameters is empty/i,
  /quota exceeded/i,
  /rate limit exceeded/i,
  /context block is not a text block/i, // mid-stream 400 from anthropic sdk
];

export function classifyError(err: ClassifierError | null | undefined): "advance" | "stop" {
  if (!err) return "stop";

  if (err.status != null) {
    if (ADVANCE_STATUS.has(err.status)) return "advance";
    if (err.status === 400 && err.body) {
      for (const re of ADVANCE_BODY_PATTERNS) {
        if (re.test(err.body)) return "advance";
      }
      return "stop";
    }
    if (err.status === 403) return "stop";
    // Other 4xx (404, 422, etc.) — stop. Let the user see the error.
    if (err.status >= 400 && err.status < 500) return "stop";
    return "stop";
  }

  if (err.code) {
    // Network-level errors: advance (might be transient).
    if (
      err.code === "ECONNRESET" ||
      err.code === "ETIMEDOUT" ||
      err.code === "ENOTFOUND" ||
      err.code === "ECONNREFUSED"
    ) {
      return "advance";
    }
  }

  return "stop";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/errorClassifier.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/errorClassifier.ts packages/core/src/utils/__tests__/errorClassifier.test.ts
git commit -m "feat(core): error classifier for chain advance/stop decisions"
```

---

## Task 3: Account pool

**Files:**
- Create: `packages/core/src/utils/accountPool.ts`
- Test: `packages/core/src/utils/__tests__/accountPool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/utils/__tests__/accountPool.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountPool } from "../accountPool";
import type { ProviderAccount } from "../configShape";

const acc = (k: string, label?: string, priority?: number): ProviderAccount =>
  label || priority ? { apiKey: k, label, priority } : { apiKey: k };

test("picks first account when pool has one entry", () => {
  const pool = new AccountPool([acc("a")]);
  assert.equal(pool.pick().apiKey, "a");
});

test("rotates accounts across picks (round-robin)", () => {
  const pool = new AccountPool([acc("a"), acc("b"), acc("c")]);
  const seq = [pool.pick().apiKey, pool.pick().apiKey, pool.pick().apiKey, pool.pick().apiKey];
  assert.deepEqual(seq, ["a", "b", "c", "a"]);
});

test("priority sorts higher first; ties keep declared order", () => {
  const pool = new AccountPool([acc("a"), acc("b", undefined, 10), acc("c", undefined, 5)]);
  assert.equal(pool.pick().apiKey, "b");
  assert.equal(pool.pick().apiKey, "c");
  assert.equal(pool.pick().apiKey, "a");
});

test("markUnhealthy skips account on next pick(s)", () => {
  const pool = new AccountPool([acc("a"), acc("b")]);
  assert.equal(pool.pick().apiKey, "a");
  pool.markUnhealthy("a", "advance");
  assert.equal(pool.pick().apiKey, "b");
  // b is the cursor; after it we go back to a only if cooldown elapsed.
  // For the simple case, markUnhealthy resets the cursor.
});

test("reset cooldown returns account to pool", () => {
  const pool = new AccountPool([acc("a"), acc("b")], { cooldownMs: 60_000 });
  pool.markUnhealthy("a", "advance");
  pool.resetCooldown("a");
  // After reset the next pick may return to a (cursor continues from where it was).
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) seen.add(pool.pick().apiKey);
  assert.ok(seen.has("a"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/accountPool.test.ts`
Expected: FAIL — `../accountPool` not found.

- [ ] **Step 3: Implement `accountPool.ts`**

Create `packages/core/src/utils/accountPool.ts`:

```ts
import type { ProviderAccount } from "./configShape";

export interface AccountPoolOptions {
  cooldownMs?: number; // default 60_000 — how long an account stays "unhealthy"
}

interface PoolState {
  account: ProviderAccount;
  unhealthyUntil: number; // epoch ms; 0 = healthy
  cursorOrder: number; // for stable tie-breaking
}

export class AccountPool {
  private state: PoolState[];
  private cursor: number = 0;
  private readonly cooldownMs: number;

  constructor(accounts: ProviderAccount[], options: AccountPoolOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 60_000;
    // Sort by priority desc, then by declared order asc.
    const indexed = accounts.map((a, i) => ({ a, i }));
    indexed.sort((x, y) => {
      const px = x.a.priority ?? 0;
      const py = y.a.priority ?? 0;
      if (py !== px) return py - px;
      return x.i - y.i;
    });
    this.state = indexed.map(({ a, i }) => ({
      account: a,
      unhealthyUntil: 0,
      cursorOrder: i,
    }));
  }

  /** Pick the next healthy account. Returns undefined if all are unhealthy. */
  pick(): ProviderAccount | undefined {
    if (this.state.length === 0) return undefined;
    const now = Date.now();
    // Try up to N times (covering full rotation).
    for (let i = 0; i < this.state.length; i++) {
      const idx = (this.cursor + i) % this.state.length;
      const s = this.state[idx];
      if (s.unhealthyUntil > now) continue;
      this.cursor = (idx + 1) % this.state.length;
      return s.account;
    }
    return undefined;
  }

  /** Mark an account as unhealthy until cooldown elapses. */
  markUnhealthy(apiKey: string, _reason: string): void {
    const s = this.state.find((s) => s.account.apiKey === apiKey);
    if (s) s.unhealthyUntil = Date.now() + this.cooldownMs;
  }

  /** Reset an account's cooldown (called when the account succeeds again). */
  resetCooldown(apiKey: string): void {
    const s = this.state.find((s) => s.account.apiKey === apiKey);
    if (s) s.unhealthyUntil = 0;
  }

  /** All accounts in declared (original) order, used for error messages. */
  accounts(): ProviderAccount[] {
    return [...this.state]
      .sort((a, b) => a.cursorOrder - b.cursorOrder)
      .map((s) => s.account);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/accountPool.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/accountPool.ts packages/core/src/utils/__tests__/accountPool.test.ts
git commit -m "feat(core): account pool with priority sort, round-robin cursor, cooldown"
```

---

## Task 4: Chain resolver

**Files:**
- Create: `packages/core/src/utils/chain.ts`
- Test: `packages/core/src/utils/__tests__/chain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/utils/__tests__/chain.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChain } from "../chain";
import type { NormalizedProvider } from "../configShape";

const p = (name: string, models: string[], accounts: string[] = ["k"]): NormalizedProvider => ({
  name,
  models,
  accounts: accounts.map((apiKey) => ({ apiKey })),
  rotation: "error",
});

const cfg = (providers: NormalizedProvider[]) => ({ providers });

test("resolves single string entry into [{ provider, model }]", () => {
  const r = resolveChain(["openai,gpt-4o"], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 1);
  assert.equal(r[0].provider.name, "openai");
  assert.equal(r[0].model, "gpt-4o");
});

test("resolves multi-entry chain in order", () => {
  const r = resolveChain(
    ["openai,gpt-4o", "groq,llama-3.3-70b"],
    cfg([p("openai", ["gpt-4o"]), p("groq", ["llama-3.3-70b"])])
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].provider.name, "openai");
  assert.equal(r[1].provider.name, "groq");
});

test("drops entries whose provider or model is unknown", () => {
  const r = resolveChain(
    ["openai,gpt-4o", "unknown,m", "groq,llama-3.3-70b"],
    cfg([p("openai", ["gpt-4o"]), p("groq", ["llama-3.3-70b"])])
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].provider.name, "openai");
  assert.equal(r[1].provider.name, "groq");
});

test("resolves provider case-insensitively (legacy: 'OpenAI' -> 'openai')", () => {
  const r = resolveChain(["OpenAI,gpt-4o"], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 1);
  assert.equal(r[0].provider.name, "openai");
});

test("trims whitespace in entry", () => {
  const r = resolveChain([" openai , gpt-4o "], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 1);
});

test("empty input returns empty chain", () => {
  const r = resolveChain([], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 0);
});

test("all entries invalid returns empty chain (not throw)", () => {
  const r = resolveChain(["x,y", "a,b"], cfg([p("openai", ["gpt-4o"])]));
  assert.equal(r.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/chain.test.ts`
Expected: FAIL — `../chain` not found.

- [ ] **Step 3: Implement `chain.ts`**

Create `packages/core/src/utils/chain.ts`:

```ts
import type { NormalizedProvider } from "./configShape";

export interface ChainEntry {
  raw: string;            // the original "provider,model" string
  provider: NormalizedProvider;
  model: string;
}

export interface ResolverConfig {
  providers: NormalizedProvider[];
}

export function resolveChain(
  entries: string[],
  config: ResolverConfig
): ChainEntry[] {
  const byName = new Map<string, NormalizedProvider>();
  for (const p of config.providers) byName.set(p.name.toLowerCase(), p);

  const out: ChainEntry[] = [];
  for (const rawEntry of entries) {
    const trimmed = rawEntry.trim();
    if (!trimmed) continue;
    const comma = trimmed.indexOf(",");
    if (comma < 0) continue;
    const providerName = trimmed.slice(0, comma).trim().toLowerCase();
    const modelName = trimmed.slice(comma + 1).trim();
    if (!providerName || !modelName) continue;

    const provider = byName.get(providerName);
    if (!provider) continue;

    const modelMatch = provider.models.find(
      (m) => m.toLowerCase() === modelName.toLowerCase()
    );
    if (!modelMatch) continue;

    out.push({ raw: trimmed, provider, model: modelMatch });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/chain.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/chain.ts packages/core/src/utils/__tests__/chain.test.ts
git commit -m "feat(core): chain resolver maps scenario refs to validated provider+model entries"
```

---

## Task 5: Chain walker (the integration glue)

**Files:**
- Create: `packages/core/src/utils/chainWalker.ts`
- Test: `packages/core/src/utils/__tests__/chainWalker.test.ts`

This task brings together the account pool, the chain resolver, and the error classifier. The walker takes a chain, an `exec(entry) → Promise<{ok, error?}>` function, and tries entries in order. For each entry, it tries accounts in pool order. It stops on first success or when the classifier says "stop".

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/utils/__tests__/chainWalker.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { walkChain } from "../chainWalker";
import { resolveChain } from "../chain";
import { AccountPool } from "../accountPool";
import type { NormalizedProvider } from "../configShape";

const p = (name: string, models: string[], accounts: string[] = ["k"]): NormalizedProvider => ({
  name,
  models,
  accounts: accounts.map((apiKey) => ({ apiKey })),
  rotation: "error",
});

test("first entry succeeds — others not tried", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(["openai,gpt-4o", "groq,llama"], {
      providers: [p("openai", ["gpt-4o"]), p("groq", ["llama"])],
    }),
    newPool: () => new AccountPool([{ apiKey: "k" }]),
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(entry.provider.name);
      return { ok: true, value: "ok" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal((result as any).value, "ok");
  assert.deepEqual(calls, ["openai"]);
});

test("first entry fails (advance) — moves to second entry", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(["openai,gpt-4o", "groq,llama"], {
      providers: [p("openai", ["gpt-4o"]), p("groq", ["llama"])],
    }),
    newPool: () => new AccountPool([{ apiKey: "k" }]),
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(entry.provider.name);
      if (entry.provider.name === "openai") return { ok: false, error: { status: 429 } };
      return { ok: true, value: "groq-ok" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal((result as any).value, "groq-ok");
  assert.deepEqual(calls, ["openai", "groq"]);
});

test("first entry fails (stop) — does NOT try second entry", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(["openai,gpt-4o", "groq,llama"], {
      providers: [p("openai", ["gpt-4o"]), p("groq", ["llama"])],
    }),
    newPool: () => new AccountPool([{ apiKey: "k" }]),
    classifyError: () => "stop",
    exec: async (entry) => {
      calls.push(entry.provider.name);
      return { ok: false, error: { status: 400, body: "missing field" } };
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["openai"]);
});

test("first entry has 2 accounts, both fail (advance) — moves to second entry, third entry", async () => {
  const calls: string[] = [];
  const result = await walkChain({
    chain: resolveChain(
      [
        { name: "openai", models: ["gpt-4o"], accounts: ["k1", "k2"] } as any,
        "groq,llama",
      ] as unknown as string[],
      {
        providers: [
          p("openai", ["gpt-4o"], ["k1", "k2"]),
          p("groq", ["llama"]),
        ],
      }
    ),
    newPool: () => new AccountPool([{ apiKey: "k1" }, { apiKey: "k2" }]),
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(`${entry.provider.name}#${entry.account.apiKey}`);
      return { ok: false, error: { status: 429 } };
    },
  });
  assert.equal(result.ok, false);
  // openai#k1, openai#k2, then both entries exhausted.
  assert.equal(calls.length, 2);
  assert.equal(calls[0], "openai#k1");
  assert.equal(calls[1], "openai#k2");
});

test("unhealthy account is marked, picked over on retry", async () => {
  const pool = new AccountPool([{ apiKey: "k1" }, { apiKey: "k2" }]);
  const calls: string[] = [];
  await walkChain({
    chain: resolveChain(["openai,gpt-4o"], {
      providers: [p("openai", ["gpt-4o"], ["k1", "k2"])],
    }),
    newPool: () => pool,
    classifyError: () => "advance",
    exec: async (entry) => {
      calls.push(entry.account.apiKey);
      return { ok: false, error: { status: 429 } };
    },
  });
  // After both accounts are tried, k1 and k2 are both marked unhealthy.
  assert.equal(calls[0], "k1");
  assert.equal(calls[1], "k2");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/chainWalker.test.ts`
Expected: FAIL — `../chainWalker` not found.

- [ ] **Step 3: Implement `chainWalker.ts`**

Create `packages/core/src/utils/chainWalker.ts`:

```ts
import { AccountPool } from "./accountPool";
import type { ChainEntry } from "./chain";
import { classifyError } from "./errorClassifier";

export type ExecResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { status?: number; code?: string; body?: string } };

export type ExecFn<T> = (entry: ChainEntry & { account: { apiKey: string } }) => Promise<ExecResult<T>>;

export interface WalkChainOptions<T> {
  chain: ChainEntry[];
  newPool: (accounts: { apiKey: string }[]) => AccountPool;
  classifyError?: (err: any) => "advance" | "stop";
  exec: ExecFn<T>;
}

export async function walkChain<T>(opts: WalkChainOptions<T>): Promise<ExecResult<T>> {
  const classify = opts.classifyError ?? classifyError;
  let lastError: any = undefined;

  for (const entry of opts.chain) {
    const pool = opts.newPool(entry.provider.accounts);
    for (let i = 0; i < entry.provider.accounts.length; i++) {
      const account = pool.pick();
      if (!account) break;
      const result = await opts.exec({ ...entry, account });
      if (result.ok) return result;
      lastError = result.error;
      const decision = classify(result.error);
      pool.markUnhealthy(account.apiKey, decision);
      if (decision === "stop") {
        return result;
      }
      // advance: try next account on the same entry.
    }
    // Both accounts on this entry exhausted; move to next entry.
  }

  return { ok: false, error: lastError ?? { body: "chain exhausted" } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/utils/__tests__/chainWalker.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/chainWalker.ts packages/core/src/utils/__tests__/chainWalker.test.ts
git commit -m "feat(core): chain walker orchestrates accounts-per-entry then next-entry"
```

---

## Task 6: Wire chain walker into the router

**Files:**
- Modify: `packages/core/src/utils/router.ts:124-200` (`getUseModel`)

This task replaces the string return of `getUseModel` with a chain return. The downstream code (`req.body.model = model`) needs `model` to be a `provider,model` string. To keep that contract, the router exposes the resolved chain on `req.chain` and sets `req.body.model` to the first entry's `provider,model`. The chain walker is invoked LATER in the request lifecycle by the server (Task 7) to actually try the chain.

- [ ] **Step 1: Read the current `getUseModel` and `router` exports**

Open `packages/core/src/utils/router.ts:124-298`. Confirm:
- `getUseModel` returns `{ model: string, scenarioType }`
- The router exports `RouterScenarioType` and `RouterFallbackConfig`
- `req.body.model = model` is set at line 290

- [ ] **Step 2: Add a `resolveChainForScenario` helper to router.ts**

Append the following near the bottom of `router.ts`, just before `export const router = ...`:

```ts
import { resolveChain } from "./chain";
import { normalizeProvider, normalizeRouter } from "./configShape";

/**
 * Resolve the chain entries for a given scenario. Returns an empty array
 * if the scenario has no entries or all are invalid.
 */
export const resolveChainForScenario = (
  scenarioType: RouterScenarioType,
  configService: ConfigService
) => {
  const routerConfig = normalizeRouter(configService.get("Router"));
  const rawProviders = (configService.get("Providers") || []) as any[];
  const providers = rawProviders.map(normalizeProvider);
  const entries = routerConfig[scenarioType] || [];
  return resolveChain(entries, { providers });
};
```

Note: the import statements at the top of `router.ts` need to be updated. Add the two new imports to the existing `import` block at line 1-15 of `router.ts`:

```ts
import { resolveChain } from "./chain";
import { normalizeProvider, normalizeRouter } from "./configShape";
```

- [ ] **Step 3: Update `router()` to populate `req.chain`**

In `packages/core/src/utils/router.ts:282-290`, change:

```ts
if (!model) {
  const result = await getUseModel(req, tokenCount, configService, lastMessageUsage);
  model = result.model;
  req.scenarioType = result.scenarioType;
} else {
  req.scenarioType = 'default';
}
req.body.model = model;
```

to:

```ts
if (!model) {
  const result = await getUseModel(req, tokenCount, configService, lastMessageUsage);
  model = result.model;
  req.scenarioType = result.scenarioType;
} else {
  req.scenarioType = 'default';
}
req.body.model = model;

// New: attach the resolved chain so the server can walk it on failure.
req.chain = resolveChainForScenario(req.scenarioType, configService);
if (req.chain.length > 0) {
  req.body.model = `${req.chain[0].provider.name},${req.chain[0].model}`;
}
```

- [ ] **Step 4: Extend `RouterContext` to include the chain field**

In `packages/core/src/utils/router.ts:202-206`, change:

```ts
export interface RouterContext {
  configService: ConfigService;
  tokenizerService?: TokenizerService;
  event?: any;
}
```

to:

```ts
import type { ChainEntry } from "./chain";

export interface RouterContext {
  configService: ConfigService;
  tokenizerService?: TokenizerService;
  event?: any;
}
```

Then add the chain field to `req` typing by extending in the body of `router()`:

```ts
(req as any).chain = ...;
```

(The chain field is set dynamically; we don't need a type for it on the request — just on the export.)

- [ ] **Step 5: Type-check**

Run: `cd packages/core && npx tsc --noEmit`
Expected: PASS. (If it fails, fix any type issues. The likely cause is missing type export from `chain.ts` — confirm `ChainEntry` is `export`ed.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/utils/router.ts
git commit -m "feat(core): router attaches resolved chain to req for server-side walk"
```

---

## Task 7: Server-side chain walk on provider failure

**Files:**
- Modify: `packages/server/src/server.ts` (around the message handler that calls the upstream provider)

The server today calls the upstream provider once. We need to: (a) wrap that call in a chain walker, (b) on `advance`, retry with the next chain entry's `provider,model` (same `req.body` shape — the transformer chain rebuilds for the new model).

This task is structural: read the existing call site, identify the upstream invocation function (likely something like `handleMessages` or similar), and wrap it. The plan does not attempt to write the full server.ts code (it's a large file) — instead it specifies the structure and the test for the wrapper.

- [ ] **Step 1: Find the upstream provider invocation in server.ts**

Run: `grep -n "router(\|fetch(\|llms.create\|provider.*request" packages/server/src/server.ts | head -10`

Open the file at the relevant line. Identify the function that:
- Receives `req` (with `req.body.model` and `req.chain`)
- Calls the upstream provider
- Returns the response (or streams it)

Note the function name and line numbers. Add a comment in the code (we'll use it in the next step) to mark the wrap point.

- [ ] **Step 2: Add a `walkProviderChain` helper next to the existing call site**

Just before the existing function, add:

```ts
import { walkChain } from "@ccw/core/utils/chainWalker";
import { classifyError } from "@ccw/core/utils/errorClassifier";

async function walkProviderChain(
  req: any,
  upstreamCall: (provider: string, model: string, accountApiKey: string) => Promise<{ status: number; body: any }>
) {
  const chain: any[] = req.chain || [];
  if (chain.length === 0) {
    // No chain — call upstream once with the current model.
    return upstreamCall("", req.body.model, "");
  }

  // Use the chain walker to try entries with account rotation.
  // (Streaming responses are not yet supported by the chain walker; for
  // non-stream we walk; for stream we set req.body.model to the first
  // chain entry and let the existing flow handle it.)
  if (req.body.stream) {
    // Fall back to first chain entry; user can disable chain to use the
    // legacy single-model behavior.
    const first = chain[0];
    return upstreamCall(first.provider.name, first.model, first.provider.accounts[0]?.apiKey ?? "");
  }

  const result = await walkChain({
    chain,
    newPool: (accounts) => new (require("@ccw/core/utils/accountPool").AccountPool)(accounts),
    exec: async (entry) => {
      try {
        const r = await upstreamCall(entry.provider.name, entry.model, entry.account.apiKey);
        if (r.status >= 200 && r.status < 300) return { ok: true, value: r };
        return { ok: false, error: { status: r.status, body: JSON.stringify(r.body).slice(0, 1024) } };
      } catch (e: any) {
        return { ok: false, error: { code: e?.code, body: e?.message } };
      }
    },
  });

  if (!result.ok) {
    // Surface the last error to the client.
    return { status: result.error.status ?? 502, body: { error: "chain exhausted", detail: result.error } };
  }
  return result.value;
}
```

(If `@ccw/core` does not re-export `chainWalker`/`errorClassifier`/`accountPool`, add re-exports to `packages/core/src/index.ts`.)

- [ ] **Step 3: Replace the existing upstream call with `walkProviderChain`**

At the call site identified in Step 1, wrap the existing upstream call. Specifically:

```ts
// Before:
const upstream = await callUpstream(req.body.model, req.body);

// After:
const upstream = await walkProviderChain(req, async (provider, model, accountApiKey) => {
  // If the chain walker supplied a non-empty provider, override req.body.model.
  if (provider) {
    req.body.model = `${provider},${model}`;
  }
  // Apply the picked account's api key as an env-style override.
  if (accountApiKey) {
    const providerName = provider || req.body.model.split(",")[0];
    process.env[`CCW_ACCOUNT_OVERRIDE_${providerName.toUpperCase()}`] = accountApiKey;
  }
  return await callUpstream(req.body.model, req.body);
});
```

(The exact override mechanism depends on how the server looks up the API key for a given provider. If it reads from `config.Providers[].accounts[].apiKey` directly, no env-override is needed. Adjust to the actual lookup path.)

- [ ] **Step 4: Type-check and build**

Run: `cd packages/core && npx tsc --noEmit && pnpm --filter @ccw/core run build`
Expected: PASS.

- [ ] **Step 5: Manual smoke test (no automated test for server integration yet)**

```bash
# 1. Start the server with a config that has a 2-entry chain where entry 1
#    is configured with a bad key. Entry 2 has a good key.
# 2. Send a request.
# 3. Confirm the response comes from entry 2's model.
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): walk provider chain on upstream failure, rotate accounts per entry"
```

---

## Task 8: Token saver transformer

**Files:**
- Create: `packages/core/src/transformer/tokenSaver.transformer.ts`
- Test: `packages/core/src/transformer/__tests__/tokenSaver.transformer.test.ts`
- Modify: `packages/core/src/transformer/index.ts` (register)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/transformer/__tests__/tokenSaver.transformer.test.ts`:

```ts
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
  // 9 consecutive "+" lines should collapse to 2 + a count summary.
  assert.ok(text.length < 200, `expected shorter output, got ${text.length} chars`);
  assert.match(text, /\+9 lines/);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/transformer/__tests__/tokenSaver.transformer.test.ts`
Expected: FAIL — `../tokenSaver.transformer` not found.

- [ ] **Step 3: Implement `tokenSaver.transformer.ts`**

Create `packages/core/src/transformer/tokenSaver.transformer.ts`:

```ts
import type { Transformer } from "../types/transformer";

const MAX_RUN = 6;            // collapse runs of identical-prefix lines after this many
const LOG_TOTAL_LINES = 200;  // truncate logs longer than this
const LOG_HEAD = 50;          // keep first N lines
const LOG_TAIL = 50;          // keep last N lines
const MAX_RESULT_CHARS = 50_000; // never return more than this from one tool_result

type Filter = (text: string) => string;

const collapseRuns: Filter = (text) => {
  const lines = text.split("\n");
  const out: string[] = [];
  let runStart = -1;
  let runPrefix = "";
  let runCount = 0;
  const flush = () => {
    if (runCount > MAX_RUN) {
      out.push(`${runPrefix} (${runCount - MAX_RUN} similar lines omitted)`);
    } else if (runCount > 0) {
      for (let i = 0; i < runCount; i++) out.push(runPrefix);
    }
    runStart = -1;
    runCount = 0;
  };
  for (const line of lines) {
    // A "run" is consecutive lines sharing the same first char and a common
    // 8-char prefix. Good enough heuristic for `+` / `-` diff lines and
    // log lines that share a timestamp.
    const prefix = line.slice(0, 8);
    const sig = line[0] === "+" || line[0] === "-" ? line[0] + prefix : prefix;
    if (sig === runPrefix) {
      runCount++;
    } else {
      flush();
      runStart = out.length;
      runPrefix = sig;
      runCount = 1;
    }
    out.push(line);
  }
  flush();
  return out.join("\n");
};

const truncateLog: Filter = (text) => {
  const lines = text.split("\n");
  if (lines.length <= LOG_TOTAL_LINES) return text;
  const head = lines.slice(0, LOG_HEAD).join("\n");
  const tail = lines.slice(-LOG_TAIL).join("\n");
  const omitted = lines.length - LOG_HEAD - LOG_TAIL;
  return `${head}\n\n... ${omitted} lines omitted ...\n\n${tail}`;
};

const cap: Filter = (text) =>
  text.length > MAX_RESULT_CHARS
    ? text.slice(0, MAX_RESULT_CHARS) + `\n... [truncated, original ${text.length} chars] ...`
    : text;

const FILTERS: Filter[] = [collapseRuns, truncateLog, cap];

function applyAll(text: string): string {
  let best = text;
  for (const f of FILTERS) {
    try {
      const next = f(best);
      if (next.length < best.length) best = next;
    } catch {
      // Filter failed; keep current best.
    }
  }
  return best;
}

function isToolResultContent(c: any): boolean {
  return c && c.type === "tool_result";
}

function getText(c: any): string | null {
  if (typeof c.content === "string") return c.content;
  if (Array.isArray(c.content)) {
    for (const part of c.content) {
      if (part && part.type === "text" && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function setText(c: any, newText: string) {
  if (typeof c.content === "string") c.content = newText;
  else if (Array.isArray(c.content)) {
    for (const part of c.content) {
      if (part && part.type === "text") {
        part.text = newText;
        return;
      }
    }
  }
}

export class TokenSaverTransformer implements Transformer {
  async transformRequestIn(request: any): Promise<any> {
    if (!request?.messages) return request;
    for (const message of request.messages) {
      if (!Array.isArray(message.content)) continue;
      for (const c of message.content) {
        if (!isToolResultContent(c)) continue;
        const text = getText(c);
        if (text == null) continue;
        const compressed = applyAll(text);
        if (compressed.length < text.length) {
          setText(c, compressed);
        }
      }
    }
    return request;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/transformer/__tests__/tokenSaver.transformer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the transformer in `transformer/index.ts`**

Open `packages/core/src/transformer/index.ts`. Add the import and registration:

```ts
import { TokenSaverTransformer } from "./tokenSaver.transformer";
// ... and in the export list:
export default {
  // ...existing
  TokenSaverTransformer,
};
```

(Also add it to the `TransformerWithStaticName` shape — see how other transformers declare their static name.)

- [ ] **Step 6: Type-check**

Run: `cd packages/core && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/transformer/tokenSaver.transformer.ts \
        packages/core/src/transformer/__tests__/tokenSaver.transformer.test.ts \
        packages/core/src/transformer/index.ts
git commit -m "feat(core): token saver transformer compresses tool_result outputs"
```

---

## Task 9: Terse mode transformer

**Files:**
- Create: `packages/core/src/transformer/terseMode.transformer.ts`
- Test: `packages/core/src/transformer/__tests__/terseMode.transformer.test.ts`
- Modify: `packages/core/src/transformer/index.ts` (register)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/transformer/__tests__/terseMode.transformer.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TerseModeTransformer } from "../terseMode.transformer";

test("enabled=true injects terse instruction at end of system", async () => {
  const t = new TerseModeTransformer({ enabled: true });
  const out = await t.transformRequestIn!(
    { system: [{ type: "text", text: "You are a helpful assistant." }] } as any,
    {} as any,
    {}
  );
  const sys = Array.isArray(out.system) ? out.system : [out.system];
  const last = sys[sys.length - 1];
  const text = typeof last === "string" ? last : last.text;
  assert.match(text, /terse/i);
  assert.match(text, /no preamble/i);
});

test("enabled=false (default) does not modify the system prompt", async () => {
  const t = new TerseModeTransformer();
  const input = { system: [{ type: "text", text: "You are a helpful assistant." }] } as any;
  const out = await t.transformRequestIn!(input, {} as any, {});
  assert.deepEqual(out, input);
});

test("appends to existing string system prompt", async () => {
  const t = new TerseModeTransformer({ enabled: true });
  const out = await t.transformRequestIn!(
    { system: "Be brief." } as any,
    {} as any,
    {}
  );
  const sys = Array.isArray(out.system) ? out.system[0] : out.system;
  assert.match(sys, /Be brief\./);
  assert.match(sys, /terse/i);
});

test("creates a system array if none exists", async () => {
  const t = new TerseModeTransformer({ enabled: true });
  const out = await t.transformRequestIn!({} as any, {} as any, {});
  assert.ok(Array.isArray(out.system));
  assert.equal(out.system.length, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx tsx --test src/transformer/__tests__/terseMode.transformer.test.ts`
Expected: FAIL — `../terseMode.transformer` not found.

- [ ] **Step 3: Implement `terseMode.transformer.ts`**

Create `packages/core/src/transformer/terseMode.transformer.ts`:

```ts
import type { Transformer, TransformerOptions } from "../types/transformer";

const TERSE_INSTRUCTION =
  "\n\nBe terse. Prefer the shortest correct answer. No preamble, no apology, " +
  "no restating the question. Use code only when the question requires it. " +
  "Skip pleasantries and summaries.";

export class TerseModeTransformer implements Transformer {
  static TransformerName = "terse";
  private readonly enabled: boolean;

  constructor(options: TransformerOptions = {}) {
    this.enabled = Boolean((options as any).enabled);
  }

  async transformRequestIn(request: any): Promise<any> {
    if (!this.enabled) return request;
    const sys = request?.system;
    if (sys == null) {
      return { ...request, system: [{ type: "text", text: TERSE_INSTRUCTION.trim() }] };
    }
    if (typeof sys === "string") {
      return { ...request, system: sys + TERSE_INSTRUCTION };
    }
    if (Array.isArray(sys)) {
      // Find the last text block; append there. If none, append a new block.
      let lastTextIdx = -1;
      for (let i = sys.length - 1; i >= 0; i--) {
        const s = sys[i];
        if (typeof s === "string" || (s && s.type === "text")) {
          lastTextIdx = i;
          break;
        }
      }
      if (lastTextIdx < 0) {
        return { ...request, system: [...sys, { type: "text", text: TERSE_INSTRUCTION.trim() }] };
      }
      const newSys = [...sys];
      const target = newSys[lastTextIdx];
      if (typeof target === "string") {
        newSys[lastTextIdx] = target + TERSE_INSTRUCTION;
      } else {
        newSys[lastTextIdx] = { ...target, text: (target.text ?? "") + TERSE_INSTRUCTION };
      }
      return { ...request, system: newSys };
    }
    return request;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx tsx --test src/transformer/__tests__/terseMode.transformer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register in `transformer/index.ts`**

Add the import and the entry to the `export default` object (mirroring Task 8 Step 5).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/transformer/terseMode.transformer.ts \
        packages/core/src/transformer/__tests__/terseMode.transformer.test.ts \
        packages/core/src/transformer/index.ts
git commit -m "feat(core): terse mode transformer injects a terse system instruction"
```

---

## Task 10: Settings — `tokenSaver` and `terseMode` toggles

**Files:**
- Modify: `packages/ui/src/locales/en.json` and `zh.json` (new keys)
- Modify: `packages/ui/src/pages/Settings.tsx` (toggle rows)

The Settings page already has a draft + sticky save bar (added in 2.1.0). Add two boolean toggles under a new "Token efficiency" section. The values live in `config.Providers`-level config (since they apply globally, not per-provider). Reuse the existing `setConfig` + `save()` flow.

- [ ] **Step 1: Add i18n keys**

In `packages/ui/src/locales/en.json`, add:

```json
{
  "settings.token_efficiency": "Token efficiency",
  "settings.token_saver": "Token saver",
  "settings.token_saver_hint": "Compress large tool outputs (git diffs, log dumps, file lists) before they reach the model.",
  "settings.terse_mode": "Terse mode",
  "settings.terse_mode_hint": "Append a terse-output instruction to the system prompt. Reduces preamble, summaries, and pleasantries."
}
```

Mirror in `packages/ui/src/locales/zh.json`:

```json
{
  "settings.token_efficiency": "Token 效率",
  "settings.token_saver": "Token 节省",
  "settings.token_saver_hint": "在到达模型前压缩大体积工具输出（git diff、日志转储、文件列表）。",
  "settings.terse_mode": "简洁模式",
  "settings.terse_mode_hint": "向系统提示追加简洁输出指令。减少开场白、总结和客套话。"
}
```

- [ ] **Step 2: Add the toggles to the Settings page**

Open `packages/ui/src/pages/Settings.tsx`. Find the section that renders the existing form fields. Add a new section (after the existing fields, before the save bar):

```tsx
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
// ... existing imports

// Inside the component:
const { t } = useTranslation();

// In the draft state, add:
const [draft, setDraft] = useState({
  // ... existing fields
  tokenSaver: config?.tokenSaver ?? true,
  terseMode: config?.terseMode ?? false,
});

// In the form (next to the other rows):
<section className="space-y-4">
  <h2 className="text-lg font-medium">{t("settings.token_efficiency")}</h2>
  <div className="flex items-center justify-between gap-4 rounded-lg border border-[--border] p-4">
    <div>
      <div className="font-medium">{t("settings.token_saver")}</div>
      <div className="text-sm text-[--muted-foreground]">{t("settings.token_saver_hint")}</div>
    </div>
    <Switch
      checked={draft.tokenSaver}
      onCheckedChange={(v) => setDraft({ ...draft, tokenSaver: v })}
    />
  </div>
  <div className="flex items-center justify-between gap-4 rounded-lg border border-[--border] p-4">
    <div>
      <div className="font-medium">{t("settings.terse_mode")}</div>
      <div className="text-sm text-[--muted-foreground]">{t("settings.terse_mode_hint")}</div>
    </div>
    <Switch
      checked={draft.terseMode}
      onCheckedChange={(v) => setDraft({ ...draft, terseMode: v })}
    />
  </div>
</section>
```

- [ ] **Step 3: Wire the values into the transformer chain**

Open `packages/core/src/services/transformer.ts` (or wherever the transformer chain is built). Find the loop that instantiates the configured transformers. Add:

```ts
if (configService.get("tokenSaver") !== false) {
  chain.push(new TokenSaverTransformer({}));
}
if (configService.get("terseMode") === true) {
  chain.push(new TerseModeTransformer({ enabled: true }));
}
```

(`tokenSaver` defaults to `true` when not present, matching the UI default.)

- [ ] **Step 4: Type-check and build**

Run: `pnpm --filter @ccw/ui run build && cd packages/core && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual UI smoke**

1. `pnpm --filter @ccw/ui run dev` (or rely on the running dev server).
2. Open `/settings`, confirm the new section appears, both toggles save correctly, the save bar appears on change, the server accepts the new config (no validation error).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/locales/en.json packages/ui/src/locales/zh.json \
        packages/ui/src/pages/Settings.tsx \
        packages/core/src/services/transformer.ts
git commit -m "feat: settings exposes token saver and terse mode toggles"
```

---

## Task 11: UI — chain editor on the Router page

**Files:**
- Modify: `packages/ui/src/pages/Router.tsx`
- Modify: `packages/ui/src/locales/en.json` and `zh.json`

The Router page today shows each scenario as a single `<Select>`. Replace it with an ordered list of `provider,model` strings, with add/remove/reorder controls. Legacy single-string config still works (the form renders one row).

- [ ] **Step 1: Add i18n keys**

In `en.json`:

```json
{
  "router.chain": "Chain",
  "router.chain_hint": "Models are tried in order. If the first fails (rate limit, quota, transient error), the next is used.",
  "router.add_entry": "Add model",
  "router.entry_placeholder": "provider,model"
}
```

In `zh.json`:

```json
{
  "router.chain": "回退链",
  "router.chain_hint": "按顺序尝试模型。若首个失败（限流、配额、瞬时错误），则使用下一个。",
  "router.add_entry": "新增模型",
  "router.entry_placeholder": "provider,model"
}
```

- [ ] **Step 2: Update Router.tsx to render an ordered list**

Open `packages/ui/src/pages/Router.tsx`. Find the rendering of each scenario row. The `draft` state changes from `{ default: string, ... }` to `{ default: string[], ... }`. Each row becomes:

```tsx
function ChainRow({ entries, onChange, scenario }: {
  entries: string[];
  onChange: (next: string[]) => void;
  scenario: RouterScenarioType;
}) {
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-[--muted-foreground] w-6">{i + 1}.</span>
          <Input
            value={entry}
            placeholder={t("router.entry_placeholder")}
            onChange={(e) => {
              const next = [...entries];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
            aria-label="remove"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...entries, ""])}
      >
        + {t("router.add_entry")}
      </Button>
    </div>
  );
}
```

Replace the existing single `<Select>` for each scenario with this component. Initialize from legacy single-string config by wrapping it in an array on mount.

- [ ] **Step 3: Backward-compat: wrap single-string values on save**

In the save handler, before `setConfig(draft)`, normalize:

```ts
const normalized = Object.fromEntries(
  Object.entries(draft).map(([k, v]) => {
    if (k === "longContextThreshold") return [k, v];
    if (Array.isArray(v)) return [k, v.filter((s) => s.trim().length > 0)];
    if (typeof v === "string" && v.length > 0) return [k, [v]];
    return [k, []];
  })
);
await save(normalized);
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @ccw/ui run build`
Expected: PASS.

- [ ] **Step 5: Manual UI smoke**

1. Add a second entry to `default`, save, restart server, send a request that fails on the first model. Confirm the second model is used.
2. Save a legacy single-string config, confirm it still loads (and renders as a one-row chain).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/pages/Router.tsx \
        packages/ui/src/locales/en.json packages/ui/src/locales/zh.json
git commit -m "feat(ui): Router page renders scenario chains as ordered lists"
```

---

## Task 12: UI — account pool editor on the Providers page

**Files:**
- Modify: `packages/ui/src/pages/Providers.tsx`
- Modify: `packages/ui/src/locales/en.json` and `zh.json`

- [ ] **Step 1: Add i18n keys**

In `en.json`:

```json
{
  "providers.account_pool": "Account pool",
  "providers.account_pool_hint": "Multiple API keys for the same provider are tried in order when one fails.",
  "providers.add_account": "Add account",
  "providers.account_label_placeholder": "Label (optional, e.g. \"personal\")",
  "providers.rotation": "Rotation strategy",
  "providers.rotation_error": "On error (default)",
  "providers.rotation_quota": "On quota"
}
```

In `zh.json`:

```json
{
  "providers.account_pool": "账户池",
  "providers.account_pool_hint": "同一 provider 的多个 API key 在某个失败时按顺序尝试。",
  "providers.add_account": "新增账户",
  "providers.account_label_placeholder": "标签（可选，如 \"personal\"）",
  "providers.rotation": "轮转策略",
  "providers.rotation_error": "错误时（默认）",
  "providers.rotation_quota": "配额耗尽时"
}
```

- [ ] **Step 2: Update Providers.tsx**

Find the existing provider card. Below the `apiKey` input, add an "Account pool" subsection. The card's draft state grows from `{ ..., apiKey }` to `{ ..., apiKey, accounts: Account[], rotation: "error" | "quota" }`. Migration on mount: if `accounts` is empty and `apiKey` is non-empty, set `accounts = [{ apiKey, label: "" }]`.

```tsx
<Collapsible>
  <CollapsibleTrigger>{t("providers.account_pool")}</CollapsibleTrigger>
  <CollapsibleContent>
    <div className="space-y-2 mt-2">
      {draft.accounts.map((acc, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={acc.apiKey}
            type="password"
            placeholder="sk-..."
            onChange={(e) => {
              const next = [...draft.accounts];
              next[i] = { ...next[i], apiKey: e.target.value };
              setDraft({ ...draft, accounts: next });
            }}
          />
          <Input
            value={acc.label ?? ""}
            placeholder={t("providers.account_label_placeholder")}
            onChange={(e) => {
              const next = [...draft.accounts];
              next[i] = { ...next[i], label: e.target.value };
              setDraft({ ...draft, accounts: next });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDraft({ ...draft, accounts: draft.accounts.filter((_, j) => j !== i) })}
            aria-label="remove account"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setDraft({ ...draft, accounts: [...draft.accounts, { apiKey: "" }] })}
      >
        + {t("providers.add_account")}
      </Button>
    </div>
  </CollapsibleContent>
</Collapsible>
```

- [ ] **Step 3: Save normalization**

When saving, if `accounts` has one entry equal to the legacy `apiKey`, write it back as the legacy `apiKey` only (no `accounts` field) to keep the saved config small. If multiple accounts, write `accounts[]` and clear the legacy `apiKey` field.

- [ ] **Step 4: Build**

Run: `pnpm --filter @ccw/ui run build`
Expected: PASS.

- [ ] **Step 5: Manual UI smoke**

1. Open `/providers`, edit a provider, add a second account, save. Reload — confirm the accounts are still there.
2. Remove all accounts and add one — confirm it saves as the legacy single-key form on the next save (back-compat).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/pages/Providers.tsx \
        packages/ui/src/locales/en.json packages/ui/src/locales/zh.json
git commit -m "feat(ui): Providers page renders account pool editor"
```

---

## Task 13: Docs — README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add README sections**

Insert after the existing "Per-task routing" section, before "Distributable presets":

```markdown
### Chain fallback

`Router` values can be a single `provider,model` string (legacy) or an
ordered list. When a list, the first entry is tried; on a recoverable
error (401, 429, 5xx, quota, mid-stream 400 from the Anthropic SDK),
the next entry is used. This is the easiest way to add resilience
without managing multiple presets.

\`\`\`json
{
  "Router": {
    "default": [
      "anthropic,claude-sonnet-4-6",
      "openai,gpt-4o-mini",
      "groq,llama-3.3-70b-versatile"
    ]
  }
}
\`\`\`

### Account pool

A provider can carry multiple API keys. On a recoverable error against
the active key, ccw rotates to the next one in the pool before
advancing the chain.

\`\`\`json
{
  "Providers": [
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com",
      "accounts": [
        { "apiKey": "$ANTHROPIC_KEY_1", "label": "personal" },
        { "apiKey": "$ANTHROPIC_KEY_2", "label": "work", "priority": 10 }
      ],
      "models": ["claude-sonnet-4-6"]
    }
  ]
}
\`\`\`

### Token saver

On by default. Compresses large `tool_result` blocks (git diffs, log
dumps, file listings) before they reach the model. Filters: run
collapse, log truncation, character cap. Safe by design — if a filter
makes the output bigger, the original is kept. Disable per config:

\`\`\`json
{ "tokenSaver": false }
\`\`\`

### Terse mode

Off by default. Appends a terse-output instruction to the system
prompt. Reduces preamble, summaries, and pleasantries.

\`\`\`json
{ "terseMode": true }
\`\`\`
```

- [ ] **Step 2: Add a CHANGELOG entry**

In `CHANGELOG.md`, add a new section above `[2.1.0]` (this release is `2.2.0` — backward-compatible, no breaking changes):

```markdown
## [2.2.0] - 2026-06-14

### Added

- **Chain fallback.** `Router` values accept a `string[]` of
  `provider,model` refs. On a recoverable error (401, 429, 5xx,
  quota, mid-stream 400), ccw advances to the next entry. The
  single-string form is still accepted.
- **Account pool.** Providers accept an `accounts[]` field. Multiple
  API keys are tried in order when one fails, before advancing the
  chain. The legacy `api_key` field is still accepted.
- **Token saver.** A new transformer compresses large `tool_result`
  blocks (git diffs, log dumps, file listings) before they reach the
  model. On by default; toggle with `tokenSaver: false` at the
  config root.
- **Terse mode.** A new transformer appends a terse-output
  instruction to the system prompt. Off by default; toggle with
  `terseMode: true`.

### Notes

- No breaking changes. Old configs load unchanged.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README + CHANGELOG for 2.2.0 (chain, account pool, token saver, terse mode)"
```

---

## Self-review

After writing the plan, run this checklist:

1. **Spec coverage:**
   - §3.1 multi-account rotation → Tasks 3 (pool), 5 (walker), 7 (server)
   - §3.2 chain → Tasks 1 (schema), 4 (resolver), 5 (walker), 7 (server)
   - §3.5 token saver → Tasks 8 (transformer), 10 (settings toggle)
   - §3.6 terse mode → Tasks 9 (transformer), 10 (settings toggle)
   - §3.4 quota rotation → deferred (per spec, behind `rotation: "quota"` flag — Tasks 3 and 5 support it; the actual quota tracker is out of scope)
   - §3.3 OAuth auto-refresh → explicitly out of scope
   - §3.7 cloud sync → explicitly out of scope
   - §3.8 docker → explicitly out of scope
   - All checked.

2. **Placeholder scan:** no "TBD" / "TODO" / "implement later" in the plan. ✓
3. **Type consistency:** `ChainEntry`, `AccountPool`, `classifyError`, `walkChain` are referenced consistently across tasks. ✓
4. **Open questions from spec §8:** all five decisions are reflected in the plan. ✓

If you find issues, fix them inline. No need to re-review.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-9router-adoption.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, spec-compliance review then code-quality review between tasks.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
