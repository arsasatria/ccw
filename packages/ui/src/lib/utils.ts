import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
