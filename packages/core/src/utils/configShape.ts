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
