export { cn } from "./cn";

export function formatNumber(
  n: number | null | undefined,
  digits = 0
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1_000) return n.toFixed(digits);
  if (Math.abs(n) < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Math.abs(n) < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function shortId(id: string, head = 6, tail = 4): string {
  if (!id) return "";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function providerModelFromRouter(
  routerEntry: string | undefined | null
): { provider: string; model: string } | null {
  if (!routerEntry || typeof routerEntry !== "string") return null;
  const [provider, model] = routerEntry.split(",").map((s) => s.trim());
  if (!provider || !model) return null;
  return { provider, model };
}

/**
 * Coerce a value into a chain of `provider,model` strings. Accepts either a
 * single string (legacy single-string config) or an array of strings, and
 * filters out empty / non-string entries. Used by the Router page and the
 * ConfigProvider to defensively normalize server- and client-side data.
 */
export function coerceChain(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

export function maskKey(key: string | undefined | null, visible = 4): string {
  if (!key) return "—";
  if (key.length <= visible) return "•".repeat(key.length);
  return `${"•".repeat(Math.max(0, key.length - visible))}${key.slice(-visible)}`;
}

export function hostnameFromUrl(url: string | undefined | null): string {
  if (!url) return "—";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Structural equality for plain JSON-shaped values. Used to detect dirty
 * state in forms that keep a "draft" copy separate from the persisted
 * config. Handles objects, arrays, and primitives; treats `null` and
 * `undefined` as distinct. Cycles are not supported (configs are trees).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (
      !deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    ) {
      return false;
    }
  }
  return true;
}
