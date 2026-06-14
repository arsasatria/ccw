import { test } from "node:test";
import assert from "node:assert/strict";
import { TransformerService } from "../transformer";
import { ConfigService } from "../config";
import { TokenSaverTransformer } from "../../transformer/tokenSaver.transformer";
import { TerseModeTransformer } from "../../transformer/terseMode.transformer";

// Mock ConfigService. Only the `get` method is used by the default
// registration path; `set` and `has` exist to satisfy the public surface.
class MockConfigService {
  private store: Record<string, any>;
  constructor(initial: Record<string, any>) {
    this.store = { ...initial };
  }
  get<T = any>(key: string, defaultValue?: T): T | undefined {
    return this.store[key] !== undefined ? (this.store[key] as T) : defaultValue;
  }
  set(key: string, value: any): void {
    this.store[key] = value;
  }
  has(key: string): boolean {
    return this.store[key] !== undefined;
  }
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

// Build a fresh service and run initialize() to drive the private
// registerDefaultTransformersInternal path.
async function initWithConfig(initial: Record<string, any>) {
  const cfg = new MockConfigService(initial) as unknown as ConfigService;
  const svc = new TransformerService(cfg, silentLogger as any);
  await svc.initialize();
  return svc;
}

// Returns true if any registered transformer is either an instance of the
// given class (e.g. TokenSaverTransformer, registered via `new`) OR is
// reference-equal to the class itself (e.g. TerseModeTransformer, registered
// via its `static TransformerName`).
function hasClassOrInstance(svc: TransformerService, ctor: any): boolean {
  for (const t of svc.getAllTransformers().values()) {
    if (t === ctor) return true;
    if (t instanceof ctor) return true;
  }
  return false;
}

test("tokenSaver=false, terseMode=true — TokenSaver NOT registered, TerseMode IS", async () => {
  const svc = await initWithConfig({ tokenSaver: false, terseMode: true });
  assert.equal(hasClassOrInstance(svc, TokenSaverTransformer), false);
  assert.equal(hasClassOrInstance(svc, TerseModeTransformer), true);
});

test("tokenSaver=undefined, terseMode=undefined — TokenSaver IS (default on), TerseMode NOT (default off)", async () => {
  const svc = await initWithConfig({});
  assert.equal(hasClassOrInstance(svc, TokenSaverTransformer), true);
  assert.equal(hasClassOrInstance(svc, TerseModeTransformer), false);
});

test("tokenSaver=true, terseMode=false — TokenSaver IS, TerseMode NOT", async () => {
  const svc = await initWithConfig({ tokenSaver: true, terseMode: false });
  assert.equal(hasClassOrInstance(svc, TokenSaverTransformer), true);
  assert.equal(hasClassOrInstance(svc, TerseModeTransformer), false);
});

test("terseMode=true: retrieved 'terse' transformer is an instance, and it modifies the request", async () => {
  const svc = await initWithConfig({ terseMode: true });
  const terse = svc.getTransformer("terse");
  // The registry must hold an INSTANCE, not the class itself. If this
  // assertion fails, provider.ts will call `new result()` later, but
  // that second construction drops the `enabled: true` option and
  // the transformer silently no-ops.
  assert.ok(terse, "'terse' transformer should be registered");
  assert.equal(
    typeof terse,
    "object",
    "'terse' should be registered as an instance, not a class"
  );
  assert.notEqual(
    typeof terse,
    "function",
    "'terse' must not be the constructor function itself"
  );
  // The instance should expose transformRequestIn directly (no further
  // `new` required by callers).
  assert.equal(
    typeof (terse as any).transformRequestIn,
    "function",
    "terse instance should expose transformRequestIn directly"
  );

  // Behavioral check: calling transformRequestIn must inject the
  // terse instruction. If the registered value were a class (or an
  // instance with enabled=false), the system field would be returned
  // unchanged.
  const out = await (terse as any).transformRequestIn({ messages: [] });
  const sys = Array.isArray(out.system) ? out.system : [out.system];
  const last = sys[sys.length - 1];
  const text = typeof last === "string" ? last : last?.text;
  assert.ok(
    typeof text === "string" && /terse/i.test(text),
    `expected system to contain terse instruction, got: ${JSON.stringify(
      out.system
    )}`
  );
});
