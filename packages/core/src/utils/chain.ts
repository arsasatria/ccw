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
