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
